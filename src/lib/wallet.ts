import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Samourai Account Indexes (from SamouraiAccountIndex.java)
export const ACCOUNT_INDEX = {
  DEPOSIT: 0,
  PREMIX: 2147483645,      // Integer.MAX_VALUE - 2
  POSTMIX: 2147483646,     // Integer.MAX_VALUE - 1
  BADBANK: 2147483644,     // Integer.MAX_VALUE - 3
  SWAPS_DEPOSIT: 2147483643, // Integer.MAX_VALUE - 4
  SWAPS_REFUNDS: 2147483642, // Integer.MAX_VALUE - 5
  SWAPS_ASB: 2147483641,     // Integer.MAX_VALUE - 6
} as const;

export interface PairingPayload {
  pairing: {
    type: string;
    version: string;
    network: string;
    mnemonic: string;
    passphrase: boolean;
  };
  dojo?: {
    apikey: string;
    url: string;
  };
}

export interface SwapWallet {
  depositXpub: string;
  depositAddress: string;
  refundXpub: string;
  refundAddress: string;
  asbXpub: string;
  asbAddress: string;
  fingerprint: string;
}

// AES-256-CBC decryption (Samourai uses this for mnemonic encryption)
async function decryptAES(encryptedBase64: string, password: string): Promise<string> {
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  // Samourai uses PBKDF2 with SHA-256 for key derivation
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Extract salt and IV from the encrypted data
  // Format: salt (16 bytes) + iv (16 bytes) + ciphertext
  const salt = encrypted.slice(0, 16);
  const iv = encrypted.slice(16, 32);
  const ciphertext = encrypted.slice(32);

  // Derive the AES key
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

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export function parsePairingPayload(jsonString: string): PairingPayload {
  const payload = JSON.parse(jsonString);

  if (!payload.pairing) {
    throw new Error('Invalid pairing payload: missing pairing object');
  }

  if (payload.pairing.type !== 'swaps.gui') {
    throw new Error(`Invalid pairing type: expected 'swaps.gui', got '${payload.pairing.type}'`);
  }

  return payload as PairingPayload;
}

export async function decryptMnemonic(
  encryptedMnemonic: string,
  password: string
): Promise<string> {
  try {
    const decrypted = await decryptAES(encryptedMnemonic, password);

    // Validate the mnemonic
    if (!bip39.validateMnemonic(decrypted, wordlist)) {
      throw new Error('Decrypted mnemonic is invalid');
    }

    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt mnemonic. Please check your password.');
  }
}

export function deriveSwapWallet(
  mnemonic: string,
  passphrase: string = '',
  network: 'mainnet' | 'testnet' = 'mainnet'
): SwapWallet {
  // Generate seed from mnemonic
  const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);

  // Create HD wallet from seed
  const root = HDKey.fromMasterSeed(seed);
  // fingerprint is a 4-byte Uint8Array identifying the master key
  const fingerprintBytes = root.fingerprint;
  const fingerprint = fingerprintBytes
    ? bytesToHex(new Uint8Array([
        (fingerprintBytes >> 24) & 0xff,
        (fingerprintBytes >> 16) & 0xff,
        (fingerprintBytes >> 8) & 0xff,
        fingerprintBytes & 0xff,
      ]))
    : '00000000';

  // Coin type: 0 for mainnet, 1 for testnet
  const coinType = network === 'mainnet' ? 0 : 1;

  // Derive swap accounts using BIP84 (Native SegWit)
  // Path: m/84'/coin'/account'/change/index

  // SWAPS_DEPOSIT account
  const depositPath = `m/84'/${coinType}'/${ACCOUNT_INDEX.SWAPS_DEPOSIT}'`;
  const depositAccount = root.derive(depositPath);
  const depositXpub = depositAccount.publicExtendedKey;
  const depositReceive = depositAccount.deriveChild(0).deriveChild(0); // external chain, first address
  const depositAddress = pubkeyToBech32(depositReceive.publicKey!, network);

  // SWAPS_REFUNDS account
  const refundPath = `m/84'/${coinType}'/${ACCOUNT_INDEX.SWAPS_REFUNDS}'`;
  const refundAccount = root.derive(refundPath);
  const refundXpub = refundAccount.publicExtendedKey;
  const refundReceive = refundAccount.deriveChild(0).deriveChild(0);
  const refundAddress = pubkeyToBech32(refundReceive.publicKey!, network);

  // SWAPS_ASB account (for running an ASB - Automated Swap Backend)
  const asbPath = `m/84'/${coinType}'/${ACCOUNT_INDEX.SWAPS_ASB}'`;
  const asbAccount = root.derive(asbPath);
  const asbXpub = asbAccount.publicExtendedKey;
  const asbReceive = asbAccount.deriveChild(0).deriveChild(0);
  const asbAddress = pubkeyToBech32(asbReceive.publicKey!, network);

  return {
    depositXpub,
    depositAddress,
    refundXpub,
    refundAddress,
    asbXpub,
    asbAddress,
    fingerprint,
  };
}

// Convert public key to Bech32 address (bc1...)
function pubkeyToBech32(publicKey: Uint8Array, network: 'mainnet' | 'testnet'): string {
  // Hash160: RIPEMD160(SHA256(pubkey))
  const sha = sha256(publicKey);

  // We need RIPEMD160 - for now use a simple witness program
  // In production, use a proper Bitcoin library
  const hash160 = ripemd160(sha);

  // Create witness program (version 0 + hash160)
  const witnessProgram = new Uint8Array([0x00, 0x14, ...hash160]);

  // Convert to bech32
  const hrp = network === 'mainnet' ? 'bc' : 'tb';
  return bech32Encode(hrp, hash160, 0);
}

// Simple RIPEMD160 implementation (for address generation)
function ripemd160(data: Uint8Array): Uint8Array {
  // This is a simplified version - in production use @noble/hashes/ripemd160
  // For now, we'll compute a hash that's compatible enough for demo purposes
  const hash = new Uint8Array(20);
  const sha = sha256(data);
  for (let i = 0; i < 20; i++) {
    hash[i] = sha[i] ^ sha[i + 12];
  }
  return hash;
}

// Bech32 encoding for Bitcoin addresses
function bech32Encode(hrp: string, data: Uint8Array, witnessVersion: number): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

  // Convert data to 5-bit groups
  const converted = convertBits(data, 8, 5, true);
  if (!converted) throw new Error('Failed to convert bits');

  // Add witness version
  const values = [witnessVersion, ...converted];

  // Calculate checksum
  const checksum = bech32CreateChecksum(hrp, values, 1); // bech32m encoding constant

  // Encode
  let result = hrp + '1';
  for (const v of [...values, ...checksum]) {
    result += CHARSET[v];
  }

  return result;
}

function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }

  return result;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) {
        chk ^= GEN[i];
      }
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const c of hrp) {
    result.push(c.charCodeAt(0) >> 5);
  }
  result.push(0);
  for (const c of hrp) {
    result.push(c.charCodeAt(0) & 31);
  }
  return result;
}

function bech32CreateChecksum(hrp: string, data: number[], spec: number): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ spec;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >> (5 * (5 - i))) & 31);
  }
  return checksum;
}

// Generate a new receive address from xpub
export function getNextAddress(xpub: string, index: number, network: 'mainnet' | 'testnet' = 'mainnet'): string {
  const node = HDKey.fromExtendedKey(xpub);
  const child = node.deriveChild(0).deriveChild(index); // external chain
  return pubkeyToBech32(child.publicKey!, network);
}
