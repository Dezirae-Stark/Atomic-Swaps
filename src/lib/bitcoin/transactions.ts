// Bitcoin Transaction Builder for Atomic Swaps
// Implements HTLC creation, signing, and redemption

import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';

// Network parameters
export const MAINNET = {
  bech32: 'bc',
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

export const TESTNET = {
  bech32: 'tb',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

export type Network = typeof MAINNET | typeof TESTNET;

// HTLC Script for Atomic Swaps
// This implements the Bitcoin side of the XMR-BTC atomic swap
//
// Script structure:
// OP_IF
//   OP_SIZE <32> OP_EQUALVERIFY
//   OP_SHA256 <secret_hash> OP_EQUALVERIFY
//   <redeem_pubkey>
// OP_ELSE
//   <timelock> OP_CHECKLOCKTIMEVERIFY OP_DROP
//   <refund_pubkey>
// OP_ENDIF
// OP_CHECKSIG

export interface HtlcParams {
  secretHash: Uint8Array;      // SHA256 hash of the secret (32 bytes)
  redeemPubkey: Uint8Array;    // Alice's pubkey for redeeming (ASB)
  refundPubkey: Uint8Array;    // Bob's pubkey for refunding (User)
  locktime: number;            // Block height or timestamp for refund
}

export function createHtlcScript(params: HtlcParams): Uint8Array {
  const { secretHash, redeemPubkey, refundPubkey, locktime } = params;

  // Build the script using btc-signer's script utilities
  // Use number encoding for script numbers
  const encodeNum = (n: number): Uint8Array => {
    if (n === 0) return new Uint8Array([]);
    if (n >= 1 && n <= 16) return new Uint8Array([0x50 + n]); // OP_1 to OP_16
    // For larger numbers, encode as little-endian with minimal bytes
    const bytes: number[] = [];
    let val = Math.abs(n);
    while (val > 0) {
      bytes.push(val & 0xff);
      val >>= 8;
    }
    // Add sign bit if needed
    if (bytes[bytes.length - 1] & 0x80) {
      bytes.push(n < 0 ? 0x80 : 0x00);
    } else if (n < 0) {
      bytes[bytes.length - 1] |= 0x80;
    }
    return new Uint8Array(bytes);
  };

  const script = btc.Script.encode([
    // IF branch - redeem with secret
    'IF',
      // Verify secret length is 32 bytes
      'SIZE',
      encodeNum(32),
      'EQUALVERIFY',
      // Verify SHA256(secret) == secretHash
      'SHA256',
      secretHash,
      'EQUALVERIFY',
      // Verify signature against redeem pubkey
      redeemPubkey,
    'ELSE',
      // ELSE branch - refund after timelock
      encodeNum(locktime),
      'CHECKLOCKTIMEVERIFY',
      'DROP',
      refundPubkey,
    'ENDIF',
    'CHECKSIG',
  ]);

  return script;
}

export function htlcScriptToAddress(script: Uint8Array, network: Network): string {
  // Create P2WSH address from script
  const scriptHash = sha256(script);
  return btc.Address(network).encode({
    type: 'wsh',
    hash: scriptHash,
  });
}

// Create the lock transaction (funds the HTLC)
export interface LockTxParams {
  inputs: Array<{
    txid: string;
    vout: number;
    value: bigint;
    script: Uint8Array;
  }>;
  htlcScript: Uint8Array;
  amount: bigint;          // Amount to lock in satoshis
  changeAddress: string;   // Change address
  feeRate: number;         // Satoshis per vbyte
  network: Network;
}

export function createLockTransaction(params: LockTxParams): btc.Transaction {
  const { inputs, htlcScript, amount, changeAddress, feeRate, network } = params;

  const tx = new btc.Transaction();

  // Add inputs
  let totalInput = BigInt(0);
  for (const input of inputs) {
    tx.addInput({
      txid: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: input.script,
        amount: input.value,
      },
    });
    totalInput += input.value;
  }

  // Calculate HTLC output script (P2WSH)
  const htlcScriptHash = sha256(htlcScript);
  const htlcOutputScript = btc.Script.encode([
    'OP_0',
    htlcScriptHash,
  ]);

  // Add HTLC output
  tx.addOutputAddress(htlcScriptToAddress(htlcScript, network), amount, network);

  // Estimate fee (rough calculation)
  const estimatedSize = 150 + inputs.length * 70; // Base + inputs
  const fee = BigInt(Math.ceil(estimatedSize * feeRate));

  // Add change output if there's enough
  const change = totalInput - amount - fee;
  if (change > BigInt(546)) { // Dust threshold
    tx.addOutputAddress(changeAddress, change, network);
  }

  return tx;
}

// Sign a transaction input with a private key
export function signInput(
  tx: btc.Transaction,
  inputIndex: number,
  privateKey: Uint8Array
): void {
  tx.signIdx(privateKey, inputIndex);
}

// Create the redeem transaction (claims funds with secret)
export interface RedeemTxParams {
  lockTxId: string;
  lockTxVout: number;
  lockTxAmount: bigint;
  htlcScript: Uint8Array;
  secret: Uint8Array;           // The preimage (32 bytes)
  redeemPrivateKey: Uint8Array; // Private key for redeem pubkey
  destinationAddress: string;
  feeRate: number;
  network: Network;
}

export function createRedeemTransaction(params: RedeemTxParams): btc.Transaction {
  const {
    lockTxId,
    lockTxVout,
    lockTxAmount,
    htlcScript,
    secret,
    redeemPrivateKey,
    destinationAddress,
    feeRate,
    network,
  } = params;

  const tx = new btc.Transaction();

  // HTLC witness script hash
  const htlcScriptHash = sha256(htlcScript);
  const witnessScript = btc.Script.encode(['OP_0', htlcScriptHash]);

  // Add HTLC input
  tx.addInput({
    txid: lockTxId,
    index: lockTxVout,
    witnessUtxo: {
      script: witnessScript,
      amount: lockTxAmount,
    },
    witnessScript: htlcScript,
  });

  // Estimate fee
  const estimatedSize = 200; // Approximate size for 1-in-1-out with witness
  const fee = BigInt(Math.ceil(estimatedSize * feeRate));

  // Add destination output
  tx.addOutputAddress(destinationAddress, lockTxAmount - fee, network);

  // Sign the input
  tx.signIdx(redeemPrivateKey, 0);

  // Build witness for redeem path: <signature> <secret> <1> <htlc_script>
  // The <1> selects the IF branch
  const signature = tx.getInput(0).finalScriptWitness?.[0];
  if (!signature) {
    throw new Error('Failed to get signature');
  }

  // Manually construct witness for HTLC redeem
  tx.updateInput(0, {
    finalScriptWitness: [
      signature,
      secret,
      new Uint8Array([0x01]), // OP_TRUE for IF branch
      htlcScript,
    ],
  });

  return tx;
}

// Create the refund transaction (reclaims funds after timelock)
export interface RefundTxParams {
  lockTxId: string;
  lockTxVout: number;
  lockTxAmount: bigint;
  htlcScript: Uint8Array;
  refundPrivateKey: Uint8Array;
  destinationAddress: string;
  locktime: number;
  feeRate: number;
  network: Network;
}

export function createRefundTransaction(params: RefundTxParams): btc.Transaction {
  const {
    lockTxId,
    lockTxVout,
    lockTxAmount,
    htlcScript,
    refundPrivateKey,
    destinationAddress,
    locktime,
    feeRate,
    network,
  } = params;

  const tx = new btc.Transaction({ lockTime: locktime });

  // HTLC witness script hash
  const htlcScriptHash = sha256(htlcScript);
  const witnessScript = btc.Script.encode(['OP_0', htlcScriptHash]);

  // Add HTLC input with sequence for CLTV
  tx.addInput({
    txid: lockTxId,
    index: lockTxVout,
    sequence: 0xfffffffe, // Enable locktime
    witnessUtxo: {
      script: witnessScript,
      amount: lockTxAmount,
    },
    witnessScript: htlcScript,
  });

  // Estimate fee
  const estimatedSize = 180;
  const fee = BigInt(Math.ceil(estimatedSize * feeRate));

  // Add destination output
  tx.addOutputAddress(destinationAddress, lockTxAmount - fee, network);

  // Sign the input
  tx.signIdx(refundPrivateKey, 0);

  // Build witness for refund path: <signature> <0> <htlc_script>
  // The <0> (empty) selects the ELSE branch
  const signature = tx.getInput(0).finalScriptWitness?.[0];
  if (!signature) {
    throw new Error('Failed to get signature');
  }

  tx.updateInput(0, {
    finalScriptWitness: [
      signature,
      new Uint8Array([]), // Empty for ELSE branch
      htlcScript,
    ],
  });

  return tx;
}

// Generate a random 32-byte secret
export function generateSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

// Hash the secret for the HTLC
export function hashSecret(secret: Uint8Array): Uint8Array {
  return sha256(secret);
}

// Derive a public key from a private key
export function derivePublicKey(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, true); // compressed
}

// Serialize transaction to hex
export function serializeTransaction(tx: btc.Transaction): string {
  return hex.encode(tx.extract());
}

// Parse transaction from hex
export function parseTransaction(hexStr: string): btc.Transaction {
  return btc.Transaction.fromRaw(hex.decode(hexStr));
}

// Calculate transaction ID
export function calculateTxId(tx: btc.Transaction): string {
  return tx.id;
}

// Validate a Bitcoin address
export function isValidAddress(address: string, network: Network): boolean {
  try {
    btc.Address(network).decode(address);
    return true;
  } catch {
    return false;
  }
}
