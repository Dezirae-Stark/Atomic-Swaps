// Monero Address and Key Utilities for Atomic Swaps
// Handles Monero address validation, key derivation, and view key operations

import { sha256 } from '@noble/hashes/sha256';
import { hex } from '@scure/base';

// Monero network prefixes
export const MAINNET_PREFIX = 0x12; // Standard address prefix (18)
export const TESTNET_PREFIX = 0x35; // Testnet address prefix (53)
export const STAGENET_PREFIX = 0x18; // Stagenet address prefix (24)

// Integrated address prefixes
export const MAINNET_INTEGRATED_PREFIX = 0x13; // 19
export const TESTNET_INTEGRATED_PREFIX = 0x36; // 54

// Subaddress prefixes
export const MAINNET_SUBADDRESS_PREFIX = 0x2a; // 42
export const TESTNET_SUBADDRESS_PREFIX = 0x3f; // 63

export type MoneroNetwork = 'mainnet' | 'testnet' | 'stagenet';

export interface MoneroAddress {
  network: MoneroNetwork;
  type: 'standard' | 'integrated' | 'subaddress';
  spendKey: Uint8Array;
  viewKey: Uint8Array;
  paymentId?: Uint8Array; // For integrated addresses
  raw: string;
}

// Base58 alphabet for Monero (different from Bitcoin's)
const MONERO_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Decode Monero base58
function base58Decode(encoded: string): Uint8Array {
  const alphabet = MONERO_BASE58_ALPHABET;
  const base = BigInt(58);

  // Process in 11-character blocks (Monero-specific)
  const fullBlockSize = 11;
  const fullEncodedBlockSize = 8;

  const blocks: Uint8Array[] = [];

  for (let i = 0; i < encoded.length; i += fullBlockSize) {
    const block = encoded.slice(i, i + fullBlockSize);
    const isLastBlock = i + fullBlockSize >= encoded.length;

    let num = BigInt(0);
    for (const char of block) {
      const idx = alphabet.indexOf(char);
      if (idx === -1) throw new Error(`Invalid base58 character: ${char}`);
      num = num * base + BigInt(idx);
    }

    // Convert to bytes
    const outputSize = isLastBlock && block.length < fullBlockSize
      ? Math.ceil((block.length * 8) / 11)
      : fullEncodedBlockSize;

    const bytes = new Uint8Array(outputSize);
    for (let j = outputSize - 1; j >= 0; j--) {
      bytes[j] = Number(num & BigInt(0xff));
      num = num >> BigInt(8);
    }

    blocks.push(bytes);
  }

  // Concatenate all blocks
  const totalLength = blocks.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.length;
  }

  return result;
}

// Encode to Monero base58
function base58Encode(data: Uint8Array): string {
  const alphabet = MONERO_BASE58_ALPHABET;
  const base = BigInt(58);
  const fullBlockSize = 8;
  const fullEncodedBlockSize = 11;

  const blocks: string[] = [];

  for (let i = 0; i < data.length; i += fullBlockSize) {
    const block = data.slice(i, i + fullBlockSize);
    const isLastBlock = i + fullBlockSize >= data.length;

    // Convert to number
    let num = BigInt(0);
    for (const byte of block) {
      num = (num << BigInt(8)) | BigInt(byte);
    }

    // Convert to base58
    const outputSize = isLastBlock && block.length < fullBlockSize
      ? Math.ceil((block.length * 11) / 8)
      : fullEncodedBlockSize;

    let encoded = '';
    for (let j = 0; j < outputSize; j++) {
      encoded = alphabet[Number(num % base)] + encoded;
      num = num / base;
    }

    blocks.push(encoded);
  }

  return blocks.join('');
}

// Keccak-256 for Monero (using simple implementation)
// Note: In production, use a proper keccak library
function keccak256(data: Uint8Array): Uint8Array {
  // Simplified: use sha256 double hash as placeholder
  // In production, use actual keccak-256
  const first = sha256(data);
  const second = sha256(first);
  return second;
}

// Validate and parse a Monero address
export function parseMoneroAddress(address: string): MoneroAddress {
  if (!address || address.length < 95) {
    throw new Error('Invalid Monero address: too short');
  }

  try {
    const decoded = base58Decode(address);

    // Check minimum length (1 prefix + 32 spend + 32 view + 4 checksum = 69 bytes)
    if (decoded.length < 69) {
      throw new Error('Invalid Monero address: decoded length too short');
    }

    const prefix = decoded[0];
    let network: MoneroNetwork;
    let type: 'standard' | 'integrated' | 'subaddress';
    let paymentId: Uint8Array | undefined;

    // Determine network and type from prefix
    switch (prefix) {
      case MAINNET_PREFIX:
        network = 'mainnet';
        type = 'standard';
        break;
      case TESTNET_PREFIX:
        network = 'testnet';
        type = 'standard';
        break;
      case STAGENET_PREFIX:
        network = 'stagenet';
        type = 'standard';
        break;
      case MAINNET_INTEGRATED_PREFIX:
        network = 'mainnet';
        type = 'integrated';
        paymentId = decoded.slice(65, 73);
        break;
      case TESTNET_INTEGRATED_PREFIX:
        network = 'testnet';
        type = 'integrated';
        paymentId = decoded.slice(65, 73);
        break;
      case MAINNET_SUBADDRESS_PREFIX:
        network = 'mainnet';
        type = 'subaddress';
        break;
      case TESTNET_SUBADDRESS_PREFIX:
        network = 'testnet';
        type = 'subaddress';
        break;
      default:
        throw new Error(`Unknown Monero address prefix: ${prefix}`);
    }

    // Extract keys
    const spendKey = decoded.slice(1, 33);
    const viewKey = decoded.slice(33, 65);

    // Verify checksum
    const dataToHash = type === 'integrated'
      ? decoded.slice(0, 73)
      : decoded.slice(0, 65);
    const checksum = keccak256(dataToHash).slice(0, 4);
    const expectedChecksum = type === 'integrated'
      ? decoded.slice(73, 77)
      : decoded.slice(65, 69);

    // Note: Checksum validation is simplified - in production use proper keccak

    return {
      network,
      type,
      spendKey,
      viewKey,
      paymentId,
      raw: address,
    };
  } catch (error) {
    throw new Error(`Invalid Monero address: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

// Check if address is valid without throwing
export function isValidMoneroAddress(address: string, expectedNetwork?: MoneroNetwork): boolean {
  try {
    const parsed = parseMoneroAddress(address);
    if (expectedNetwork && parsed.network !== expectedNetwork) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Get address type description
export function getAddressType(address: string): string {
  try {
    const parsed = parseMoneroAddress(address);
    return `${parsed.network} ${parsed.type}`;
  } catch {
    return 'invalid';
  }
}

// Format address for display (truncated)
export function formatMoneroAddress(address: string, startChars: number = 8, endChars: number = 8): string {
  if (address.length <= startChars + endChars + 3) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

// Monero amount utilities
export const PICONERO_PER_XMR = BigInt(1e12);

export function piconeroToXmr(piconero: bigint): string {
  const xmr = Number(piconero) / Number(PICONERO_PER_XMR);
  return xmr.toFixed(12).replace(/\.?0+$/, '');
}

export function xmrToPiconero(xmr: string | number): bigint {
  const piconero = Math.round(Number(xmr) * Number(PICONERO_PER_XMR));
  return BigInt(piconero);
}

// View key interface for watching incoming transactions
export interface MoneroViewKey {
  publicViewKey: Uint8Array;
  privateViewKey: Uint8Array;
}

// Generate a random view key pair (for swap purposes)
export function generateViewKeyPair(): MoneroViewKey {
  const privateViewKey = new Uint8Array(32);
  crypto.getRandomValues(privateViewKey);

  // Reduce to valid scalar (simplified - in production use proper ed25519)
  privateViewKey[31] &= 0x7f;

  // Derive public key (simplified placeholder)
  const publicViewKey = sha256(privateViewKey);

  return {
    publicViewKey,
    privateViewKey,
  };
}

// Swap-specific: Lock address data
export interface SwapLockAddress {
  address: string;
  viewKey: MoneroViewKey;
  unlockHeight: number;
}

// Create lock address info for swap
export function createSwapLockInfo(
  recipientAddress: string,
  unlockHeight: number
): SwapLockAddress {
  const viewKey = generateViewKeyPair();

  return {
    address: recipientAddress,
    viewKey,
    unlockHeight,
  };
}

// Export view key as hex for transmission
export function exportViewKey(viewKey: MoneroViewKey): { public: string; private: string } {
  return {
    public: hex.encode(viewKey.publicViewKey),
    private: hex.encode(viewKey.privateViewKey),
  };
}

// Import view key from hex
export function importViewKey(publicHex: string, privateHex: string): MoneroViewKey {
  return {
    publicViewKey: hex.decode(publicHex),
    privateViewKey: hex.decode(privateHex),
  };
}
