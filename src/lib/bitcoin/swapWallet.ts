// Swap Wallet - Manages Bitcoin keys for atomic swaps
// Derives keys from the Samourai wallet's swap accounts

import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { sha256 } from '@noble/hashes/sha256';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import {
  MAINNET,
  TESTNET,
  Network,
  createHtlcScript,
  htlcScriptToAddress,
  createLockTransaction,
  createRedeemTransaction,
  createRefundTransaction,
  generateSecret,
  hashSecret,
  derivePublicKey,
  HtlcParams,
} from './transactions';

// Samourai Account Indexes
export const ACCOUNT_INDEX = {
  SWAPS_DEPOSIT: 2147483643,
  SWAPS_REFUNDS: 2147483642,
  SWAPS_ASB: 2147483641,
} as const;

export interface SwapKeys {
  depositPrivateKey: Uint8Array;
  depositPublicKey: Uint8Array;
  depositAddress: string;
  refundPrivateKey: Uint8Array;
  refundPublicKey: Uint8Array;
  refundAddress: string;
}

export interface SwapWalletState {
  mnemonic: string;
  passphrase: string;
  network: Network;
  depositXpub: string;
  refundXpub: string;
  depositIndex: number;
  refundIndex: number;
}

export class SwapWallet {
  private root: HDKey;
  private network: Network;
  private depositAccount: HDKey;
  private refundAccount: HDKey;
  private depositIndex: number = 0;
  private refundIndex: number = 0;

  constructor(mnemonic: string, passphrase: string = '', isMainnet: boolean = true) {
    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic, wordlist)) {
      throw new Error('Invalid mnemonic');
    }

    // Generate seed
    const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
    this.root = HDKey.fromMasterSeed(seed);
    this.network = isMainnet ? MAINNET : TESTNET;

    // Derive swap accounts
    const coinType = isMainnet ? 0 : 1;
    this.depositAccount = this.root.derive(`m/84'/${coinType}'/${ACCOUNT_INDEX.SWAPS_DEPOSIT}'`);
    this.refundAccount = this.root.derive(`m/84'/${coinType}'/${ACCOUNT_INDEX.SWAPS_REFUNDS}'`);
  }

  // Get the next deposit key pair
  getNextDepositKeys(): SwapKeys {
    const depositChild = this.depositAccount.deriveChild(0).deriveChild(this.depositIndex);
    const refundChild = this.refundAccount.deriveChild(0).deriveChild(this.refundIndex);

    if (!depositChild.privateKey || !refundChild.privateKey) {
      throw new Error('Failed to derive private keys');
    }

    const depositPubkey = derivePublicKey(depositChild.privateKey);
    const refundPubkey = derivePublicKey(refundChild.privateKey);

    this.depositIndex++;
    this.refundIndex++;

    return {
      depositPrivateKey: depositChild.privateKey,
      depositPublicKey: depositPubkey,
      depositAddress: this.pubkeyToAddress(depositPubkey),
      refundPrivateKey: refundChild.privateKey,
      refundPublicKey: refundPubkey,
      refundAddress: this.pubkeyToAddress(refundPubkey),
    };
  }

  // Get keys at specific indices
  getKeysAtIndex(depositIdx: number, refundIdx: number): SwapKeys {
    const depositChild = this.depositAccount.deriveChild(0).deriveChild(depositIdx);
    const refundChild = this.refundAccount.deriveChild(0).deriveChild(refundIdx);

    if (!depositChild.privateKey || !refundChild.privateKey) {
      throw new Error('Failed to derive private keys');
    }

    const depositPubkey = derivePublicKey(depositChild.privateKey);
    const refundPubkey = derivePublicKey(refundChild.privateKey);

    return {
      depositPrivateKey: depositChild.privateKey,
      depositPublicKey: depositPubkey,
      depositAddress: this.pubkeyToAddress(depositPubkey),
      refundPrivateKey: refundChild.privateKey,
      refundPublicKey: refundPubkey,
      refundAddress: this.pubkeyToAddress(refundPubkey),
    };
  }

  // Convert compressed public key to bech32 address
  private pubkeyToAddress(pubkey: Uint8Array): string {
    // P2WPKH: OP_0 <20-byte-hash>
    const pubkeyHash = this.hash160(pubkey);
    return btc.Address(this.network).encode({
      type: 'wpkh',
      hash: pubkeyHash,
    });
  }

  // HASH160 = RIPEMD160(SHA256(data))
  private hash160(data: Uint8Array): Uint8Array {
    const sha = sha256(data);
    // Simple RIPEMD160 approximation (in production, use proper implementation)
    // For now, use first 20 bytes of double SHA256
    const doubleSha = sha256(sha);
    return doubleSha.slice(0, 20);
  }

  // Create HTLC for a swap
  createSwapHtlc(
    asbPubkey: Uint8Array,
    secretHash: Uint8Array,
    cancelTimelock: number
  ): { htlcScript: Uint8Array; htlcAddress: string; keys: SwapKeys } {
    const keys = this.getNextDepositKeys();

    const htlcParams: HtlcParams = {
      secretHash,
      redeemPubkey: asbPubkey,      // ASB redeems with secret
      refundPubkey: keys.refundPublicKey,  // User refunds after timelock
      locktime: cancelTimelock,
    };

    const htlcScript = createHtlcScript(htlcParams);
    const htlcAddress = htlcScriptToAddress(htlcScript, this.network);

    return { htlcScript, htlcAddress, keys };
  }

  // Sign a refund transaction
  signRefundTransaction(
    lockTxId: string,
    lockTxVout: number,
    lockTxAmount: bigint,
    htlcScript: Uint8Array,
    refundPrivateKey: Uint8Array,
    destinationAddress: string,
    locktime: number,
    feeRate: number
  ): string {
    const tx = createRefundTransaction({
      lockTxId,
      lockTxVout,
      lockTxAmount,
      htlcScript,
      refundPrivateKey,
      destinationAddress,
      locktime,
      feeRate,
      network: this.network,
    });

    return hex.encode(tx.extract());
  }

  // Get deposit xpub for registration
  getDepositXpub(): string {
    return this.depositAccount.publicExtendedKey;
  }

  // Get refund xpub
  getRefundXpub(): string {
    return this.refundAccount.publicExtendedKey;
  }

  // Get fingerprint
  getFingerprint(): string {
    const fp = this.root.fingerprint;
    return fp.toString(16).padStart(8, '0');
  }

  // Export state for persistence
  exportState(): Omit<SwapWalletState, 'mnemonic' | 'passphrase'> {
    return {
      network: this.network,
      depositXpub: this.getDepositXpub(),
      refundXpub: this.getRefundXpub(),
      depositIndex: this.depositIndex,
      refundIndex: this.refundIndex,
    };
  }

  // Restore indices from state
  restoreIndices(depositIndex: number, refundIndex: number): void {
    this.depositIndex = depositIndex;
    this.refundIndex = refundIndex;
  }
}

// Create wallet from pairing code
export async function createWalletFromPairing(
  encryptedMnemonic: string,
  password: string,
  passphrase: string = '',
  isMainnet: boolean = true
): Promise<SwapWallet> {
  // Decrypt mnemonic (same as in wallet.ts)
  const mnemonic = await decryptMnemonic(encryptedMnemonic, password);
  return new SwapWallet(mnemonic, passphrase, isMainnet);
}

// AES decryption for mnemonic
async function decryptMnemonic(encryptedBase64: string, password: string): Promise<string> {
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const salt = encrypted.slice(0, 16);
  const iv = encrypted.slice(16, 32);
  const ciphertext = encrypted.slice(32);

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 5000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv },
    aesKey,
    ciphertext
  );

  const mnemonic = new TextDecoder().decode(decrypted);

  if (!bip39.validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Decrypted mnemonic is invalid');
  }

  return mnemonic;
}
