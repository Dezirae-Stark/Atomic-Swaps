import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export async function POST(request: NextRequest) {
  try {
    const { backupContent, password } = await request.json();

    if (!backupContent || !password) {
      return NextResponse.json(
        { error: 'Missing backupContent or password' },
        { status: 400 }
      );
    }

    // Clean the backup content
    let cleanContent = backupContent.trim();
    const firstBrace = cleanContent.indexOf('{');
    if (firstBrace > 0) {
      cleanContent = cleanContent.substring(firstBrace);
    }

    // Parse JSON, handling garbage at end
    let backup: { version: number; payload: string; external?: boolean };
    try {
      backup = JSON.parse(cleanContent);
    } catch {
      // Find proper JSON ending
      const falseEnd = cleanContent.indexOf('"external":false}');
      const trueEnd = cleanContent.indexOf('"external":true}');
      let endIndex = -1;
      if (falseEnd > 0) endIndex = falseEnd + '"external":false}'.length;
      else if (trueEnd > 0) endIndex = trueEnd + '"external":true}'.length;

      if (endIndex > 0) {
        cleanContent = cleanContent.substring(0, endIndex);
        backup = JSON.parse(cleanContent);
      } else {
        throw new Error('Invalid JSON in backup file');
      }
    }

    if (!backup.payload) {
      return NextResponse.json(
        { error: 'Invalid backup file: missing payload' },
        { status: 400 }
      );
    }

    // Check for Salted__ format
    if (!backup.payload.startsWith('U2FsdGVkX1')) {
      return NextResponse.json(
        { error: 'Unsupported backup format' },
        { status: 400 }
      );
    }

    // Decode base64 payload (remove newlines first)
    const cleanPayload = backup.payload.replace(/[\r\n\s]/g, '');
    const encrypted = Buffer.from(cleanPayload, 'base64');

    // Extract salt and ciphertext
    const salt = encrypted.slice(8, 16);
    const ciphertext = encrypted.slice(16);

    // PBKDF2 key derivation (15000 iterations, SHA-256)
    const keyIv = crypto.pbkdf2Sync(password, salt, 15000, 48, 'sha256');
    const key = keyIv.slice(0, 32);
    const iv = keyIv.slice(32, 48);

    // AES-256-CBC decryption
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const decryptedStr = decrypted.toString('utf8');

    // Parse decrypted JSON
    const walletData = JSON.parse(decryptedStr);
    const hexEntropy = walletData.wallet?.seed || walletData.seed;

    if (!hexEntropy || !/^[0-9a-fA-F]+$/.test(hexEntropy)) {
      return NextResponse.json(
        { error: 'No valid seed found in backup' },
        { status: 400 }
      );
    }

    // Convert hex entropy to mnemonic
    const entropyBytes = Buffer.from(hexEntropy, 'hex');
    const mnemonic = bip39.entropyToMnemonic(entropyBytes, wordlist);

    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic, wordlist)) {
      return NextResponse.json(
        { error: 'Generated mnemonic is invalid' },
        { status: 400 }
      );
    }

    // Also return network info
    const network = walletData.wallet?.testnet === true ? 'testnet' : 'mainnet';

    return NextResponse.json({
      success: true,
      mnemonic,
      network,
      fingerprint: walletData.wallet?.fingerprint
    });

  } catch (error: any) {
    console.error('Decrypt backup error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to decrypt backup' },
      { status: 500 }
    );
  }
}
