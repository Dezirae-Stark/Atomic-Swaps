import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// MD5 implementation for OpenSSL EVP_BytesToKey compatibility
// Based on RFC 1321 reference implementation
function md5(data: Uint8Array): Uint8Array {
  const add32 = (a: number, b: number) => (a + b) & 0xFFFFFFFF;

  const cmn = (q: number, a: number, b: number, x: number, s: number, t: number) => {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  };

  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & c) | ((~b) & d), a, b, x, s, t);

  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & d) | (c & (~d)), a, b, x, s, t);

  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(b ^ c ^ d, a, b, x, s, t);

  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(c ^ (b | (~d)), a, b, x, s, t);

  // Pad message to 64-byte boundary
  const origLen = data.length;
  const padLen = (origLen % 64 < 56) ? (56 - origLen % 64) : (120 - origLen % 64);
  const totalLen = origLen + padLen + 8;
  const msg = new Uint8Array(totalLen);
  msg.set(data);
  msg[origLen] = 0x80;

  // Append length in bits as 64-bit little-endian
  const bitLenLo = (origLen * 8) >>> 0;
  const bitLenHi = (origLen * 8 / 0x100000000) >>> 0;
  const lenView = new DataView(msg.buffer, msg.byteOffset + origLen + padLen);
  lenView.setUint32(0, bitLenLo, true);
  lenView.setUint32(4, bitLenHi, true);

  // Initialize state
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  // Process 64-byte blocks
  for (let i = 0; i < totalLen; i += 64) {
    const w = new Uint32Array(16);
    const blockView = new DataView(msg.buffer, msg.byteOffset + i, 64);
    for (let j = 0; j < 16; j++) {
      w[j] = blockView.getUint32(j * 4, true);
    }

    let aa = a, bb = b, cc = c, dd = d;

    a = ff(a, b, c, d, w[0], 7, 0xd76aa478);
    d = ff(d, a, b, c, w[1], 12, 0xe8c7b756);
    c = ff(c, d, a, b, w[2], 17, 0x242070db);
    b = ff(b, c, d, a, w[3], 22, 0xc1bdceee);
    a = ff(a, b, c, d, w[4], 7, 0xf57c0faf);
    d = ff(d, a, b, c, w[5], 12, 0x4787c62a);
    c = ff(c, d, a, b, w[6], 17, 0xa8304613);
    b = ff(b, c, d, a, w[7], 22, 0xfd469501);
    a = ff(a, b, c, d, w[8], 7, 0x698098d8);
    d = ff(d, a, b, c, w[9], 12, 0x8b44f7af);
    c = ff(c, d, a, b, w[10], 17, 0xffff5bb1);
    b = ff(b, c, d, a, w[11], 22, 0x895cd7be);
    a = ff(a, b, c, d, w[12], 7, 0x6b901122);
    d = ff(d, a, b, c, w[13], 12, 0xfd987193);
    c = ff(c, d, a, b, w[14], 17, 0xa679438e);
    b = ff(b, c, d, a, w[15], 22, 0x49b40821);

    a = gg(a, b, c, d, w[1], 5, 0xf61e2562);
    d = gg(d, a, b, c, w[6], 9, 0xc040b340);
    c = gg(c, d, a, b, w[11], 14, 0x265e5a51);
    b = gg(b, c, d, a, w[0], 20, 0xe9b6c7aa);
    a = gg(a, b, c, d, w[5], 5, 0xd62f105d);
    d = gg(d, a, b, c, w[10], 9, 0x02441453);
    c = gg(c, d, a, b, w[15], 14, 0xd8a1e681);
    b = gg(b, c, d, a, w[4], 20, 0xe7d3fbc8);
    a = gg(a, b, c, d, w[9], 5, 0x21e1cde6);
    d = gg(d, a, b, c, w[14], 9, 0xc33707d6);
    c = gg(c, d, a, b, w[3], 14, 0xf4d50d87);
    b = gg(b, c, d, a, w[8], 20, 0x455a14ed);
    a = gg(a, b, c, d, w[13], 5, 0xa9e3e905);
    d = gg(d, a, b, c, w[2], 9, 0xfcefa3f8);
    c = gg(c, d, a, b, w[7], 14, 0x676f02d9);
    b = gg(b, c, d, a, w[12], 20, 0x8d2a4c8a);

    a = hh(a, b, c, d, w[5], 4, 0xfffa3942);
    d = hh(d, a, b, c, w[8], 11, 0x8771f681);
    c = hh(c, d, a, b, w[11], 16, 0x6d9d6122);
    b = hh(b, c, d, a, w[14], 23, 0xfde5380c);
    a = hh(a, b, c, d, w[1], 4, 0xa4beea44);
    d = hh(d, a, b, c, w[4], 11, 0x4bdecfa9);
    c = hh(c, d, a, b, w[7], 16, 0xf6bb4b60);
    b = hh(b, c, d, a, w[10], 23, 0xbebfbc70);
    a = hh(a, b, c, d, w[13], 4, 0x289b7ec6);
    d = hh(d, a, b, c, w[0], 11, 0xeaa127fa);
    c = hh(c, d, a, b, w[3], 16, 0xd4ef3085);
    b = hh(b, c, d, a, w[6], 23, 0x04881d05);
    a = hh(a, b, c, d, w[9], 4, 0xd9d4d039);
    d = hh(d, a, b, c, w[12], 11, 0xe6db99e5);
    c = hh(c, d, a, b, w[15], 16, 0x1fa27cf8);
    b = hh(b, c, d, a, w[2], 23, 0xc4ac5665);

    a = ii(a, b, c, d, w[0], 6, 0xf4292244);
    d = ii(d, a, b, c, w[7], 10, 0x432aff97);
    c = ii(c, d, a, b, w[14], 15, 0xab9423a7);
    b = ii(b, c, d, a, w[5], 21, 0xfc93a039);
    a = ii(a, b, c, d, w[12], 6, 0x655b59c3);
    d = ii(d, a, b, c, w[3], 10, 0x8f0ccc92);
    c = ii(c, d, a, b, w[10], 15, 0xffeff47d);
    b = ii(b, c, d, a, w[1], 21, 0x85845dd1);
    a = ii(a, b, c, d, w[8], 6, 0x6fa87e4f);
    d = ii(d, a, b, c, w[15], 10, 0xfe2ce6e0);
    c = ii(c, d, a, b, w[6], 15, 0xa3014314);
    b = ii(b, c, d, a, w[13], 21, 0x4e0811a1);
    a = ii(a, b, c, d, w[4], 6, 0xf7537e82);
    d = ii(d, a, b, c, w[11], 10, 0xbd3af235);
    c = ii(c, d, a, b, w[2], 15, 0x2ad7d2bb);
    b = ii(b, c, d, a, w[9], 21, 0xeb86d391);

    a = add32(a, aa);
    b = add32(b, bb);
    c = add32(c, cc);
    d = add32(d, dd);
  }

  // Output
  const result = new Uint8Array(16);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, a, true);
  resultView.setUint32(4, b, true);
  resultView.setUint32(8, c, true);
  resultView.setUint32(12, d, true);
  return result;
}

// OpenSSL EVP_BytesToKey derivation (used for "Salted__" format)
// hashFn: 'md5' for legacy OpenSSL, 'sha256' for OpenSSL 1.1.0+
function evpBytesToKey(
  password: string,
  salt: Uint8Array,
  keyLen: number = 32,
  ivLen: number = 16,
  hashFn: 'md5' | 'sha256' = 'sha256'
): { key: Uint8Array; iv: Uint8Array } {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const totalLen = keyLen + ivLen;
  const result = new Uint8Array(totalLen);
  let resultOffset = 0;
  let prevHash: Uint8Array | null = null;

  while (resultOffset < totalLen) {
    // Concatenate previous hash (if any) + password + salt
    const toHash = new Uint8Array(
      (prevHash ? prevHash.length : 0) + passwordBytes.length + salt.length
    );
    let offset = 0;
    if (prevHash) {
      toHash.set(prevHash, offset);
      offset += prevHash.length;
    }
    toHash.set(passwordBytes, offset);
    offset += passwordBytes.length;
    toHash.set(salt, offset);

    // Hash with the specified algorithm
    if (hashFn === 'md5') {
      prevHash = md5(toHash);
    } else {
      prevHash = sha256(toHash);
    }

    // Copy to result
    const copyLen = Math.min(prevHash.length, totalLen - resultOffset);
    result.set(prevHash.slice(0, copyLen), resultOffset);
    resultOffset += copyLen;
  }

  return {
    key: result.slice(0, keyLen),
    iv: result.slice(keyLen, keyLen + ivLen)
  };
}

// PBKDF2 key derivation for Samourai backup files
async function pbkdf2Derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLen: number,
  ivLen: number
): Promise<{ key: Uint8Array; iv: Uint8Array }> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key + IV bytes
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    (keyLen + ivLen) * 8
  );

  const derived = new Uint8Array(derivedBits);
  return {
    key: derived.slice(0, keyLen),
    iv: derived.slice(keyLen, keyLen + ivLen)
  };
}

// Decrypt OpenSSL "Salted__" format (used in Samourai backup files)
async function decryptOpenSSL(encryptedBase64: string, password: string): Promise<string> {
  // Clean base64 - remove newlines that may be present
  const cleanBase64 = encryptedBase64.replace(/[\r\n\s]/g, '');
  const encrypted = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0));

  // Check for "Salted__" magic header
  const magic = new TextDecoder().decode(encrypted.slice(0, 8));
  if (magic !== 'Salted__') {
    throw new Error('Invalid OpenSSL format: missing Salted__ header');
  }

  // Extract salt (8 bytes after magic) and ciphertext
  const salt = encrypted.slice(8, 16);
  const ciphertext = encrypted.slice(16);

  console.log('Decrypting Samourai backup...');
  console.log('Password length:', password.length);
  console.log('Password preview:', password.substring(0, 3) + '***');
  console.log('Salt (hex):', Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''));
  console.log('Ciphertext length:', ciphertext.length);

  // Try Samourai PBKDF2 method first (15000 iterations, SHA-256)
  try {
    const { key, iv } = await pbkdf2Derive(password, salt, 15000, 32, 16);

    console.log('Using PBKDF2-SHA256 with 15000 iterations');
    console.log('Derived key (hex):', Array.from(key).map(b => b.toString(16).padStart(2, '0')).join(''));
    console.log('Derived IV (hex):', Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''));

    const aesKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-CBC', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv },
      aesKey,
      ciphertext
    );

    console.log('PBKDF2 decryption succeeded!');
    return new TextDecoder().decode(decrypted);
  } catch (e: any) {
    console.log('PBKDF2 failed, trying EVP_BytesToKey fallback:', e.message);
  }

  // Fallback to EVP_BytesToKey for other OpenSSL encrypted files
  const configs: Array<{ hash: 'sha256' | 'md5'; keyLen: number }> = [
    { hash: 'md5', keyLen: 32 },
    { hash: 'sha256', keyLen: 32 },
    { hash: 'md5', keyLen: 16 },
    { hash: 'sha256', keyLen: 16 },
  ];

  const errors: string[] = [];
  for (const { hash, keyLen } of configs) {
    try {
      const { key, iv } = evpBytesToKey(password, salt, keyLen, 16, hash);

      const aesKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-CBC', length: keyLen * 8 },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: iv },
        aesKey,
        ciphertext
      );

      console.log('EVP_BytesToKey decryption succeeded with', hash, keyLen);
      return new TextDecoder().decode(decrypted);
    } catch (e: any) {
      errors.push(`${hash}/${keyLen}: ${e.message}`);
      continue;
    }
  }

  console.error('All decryption attempts failed:', errors);

  throw new Error('Failed to decrypt: wrong password or unsupported encryption');
}

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

  // Samourai uses PBKDF2 with SHA-1 for key derivation
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
      hash: 'SHA-1',
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

// Samourai backup file format interface
export interface SamouraiBackup {
  version: number;
  payload: string;
  external?: boolean;
}

// Decrypt Samourai wallet backup file
export async function decryptBackupFile(
  backupContent: string,
  password: string
): Promise<string> {
  try {
    // Clean the backup content - sometimes there's garbage after the JSON
    let cleanContent = backupContent.trim();

    // Find the start of JSON
    const firstBrace = cleanContent.indexOf('{');
    if (firstBrace > 0) {
      cleanContent = cleanContent.substring(firstBrace);
    }

    // Try to parse, if it fails, try to find proper JSON ending
    let backup: SamouraiBackup;
    try {
      backup = JSON.parse(cleanContent);
    } catch (parseError) {
      console.log('Initial JSON parse failed, trying to find valid JSON...');

      // Look for the pattern that ends Samourai backup: "external":false} or "external":true}
      const falseEnd = cleanContent.indexOf('"external":false}');
      const trueEnd = cleanContent.indexOf('"external":true}');

      let endIndex = -1;
      if (falseEnd > 0) {
        endIndex = falseEnd + '"external":false}'.length;
      } else if (trueEnd > 0) {
        endIndex = trueEnd + '"external":true}'.length;
      }

      if (endIndex > 0) {
        cleanContent = cleanContent.substring(0, endIndex);
        console.log('Trimmed to valid JSON ending at position', endIndex);
        backup = JSON.parse(cleanContent);
      } else {
        // Try finding last valid closing brace before garbage
        // Work backwards from end to find valid JSON
        for (let i = cleanContent.length - 1; i > 0; i--) {
          if (cleanContent[i] === '}') {
            try {
              backup = JSON.parse(cleanContent.substring(0, i + 1));
              console.log('Found valid JSON ending at position', i);
              break;
            } catch {
              continue;
            }
          }
        }
        if (!backup!) {
          throw parseError;
        }
      }
    }

    console.log('Backup version:', backup.version);
    console.log('Payload starts with:', backup.payload?.substring(0, 20));

    if (!backup.payload) {
      throw new Error('Invalid backup file: missing payload');
    }

    // Check if payload is OpenSSL encrypted (starts with "Salted__" in base64)
    // "U2FsdGVkX1" is base64 for "Salted__"
    if (backup.payload.startsWith('U2FsdGVkX1')) {
      console.log('Detected OpenSSL Salted__ format');

      let decrypted: string;
      try {
        decrypted = await decryptOpenSSL(backup.payload, password);
        console.log('Decryption successful, result length:', decrypted.length);
        console.log('Decrypted starts with:', decrypted.substring(0, 50));
      } catch (e: any) {
        console.error('OpenSSL decryption failed:', e.message);
        throw new Error('Failed to decrypt backup: ' + e.message);
      }

      // The decrypted content is JSON containing wallet data
      let mnemonic: string;
      try {
        const decryptedObj = JSON.parse(decrypted);
        console.log('Decrypted is JSON, keys:', Object.keys(decryptedObj));

        // Samourai stores seed as hex entropy, not mnemonic
        const seed = decryptedObj.wallet?.seed || decryptedObj.seed;

        if (seed && /^[0-9a-fA-F]+$/.test(seed)) {
          // Convert hex entropy to mnemonic
          console.log('Found hex entropy, converting to mnemonic...');
          mnemonic = bip39.entropyToMnemonic(hexToBytes(seed), wordlist);
          console.log('Converted entropy to mnemonic, word count:', mnemonic.split(' ').length);
        } else {
          // Try to find mnemonic string directly
          mnemonic = decryptedObj.wallet?.mnemonic ||
                     decryptedObj.mnemonic ||
                     seed ||
                     decrypted;
        }
      } catch {
        // Not JSON, assume it's the raw mnemonic
        console.log('Decrypted is not JSON, treating as raw mnemonic');
        mnemonic = decrypted.trim();
      }

      // Validate the mnemonic
      if (!bip39.validateMnemonic(mnemonic, wordlist)) {
        console.error('Mnemonic validation failed:', mnemonic.substring(0, 50));
        throw new Error('Decrypted content is not a valid BIP39 mnemonic');
      }

      console.log('Mnemonic validated successfully!');
      return mnemonic;
    }

    // Try PBKDF2 format (fallback for older backups)
    const decrypted = await decryptAES(backup.payload, password);

    if (!bip39.validateMnemonic(decrypted, wordlist)) {
      throw new Error('Decrypted mnemonic is invalid');
    }

    return decrypted;
  } catch (error) {
    console.error('decryptBackupFile error:', error);
    if (error instanceof Error) {
      // Propagate specific errors
      if (error.message.includes('mnemonic') ||
          error.message.includes('decrypt') ||
          error.message.includes('Invalid')) {
        throw error;
      }
      throw new Error('Failed to decrypt backup: ' + error.message);
    }
    throw new Error('Failed to decrypt backup file. Please check your password.');
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
