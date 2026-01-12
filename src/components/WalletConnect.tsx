'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import {
  parsePairingPayload,
  decryptMnemonic,
  decryptBackupFile,
  deriveSwapWallet,
} from '@/lib/wallet';
import { WalletState } from '@/types';

interface WalletConnectProps {
  onConnect: (wallet: WalletState, mnemonic?: string, passphrase?: string) => void;
}

type ConnectionMethod = 'paste' | 'scan' | 'manual' | 'backup' | null;

export function WalletConnect({ onConnect }: WalletConnectProps) {
  const [method, setMethod] = useState<ConnectionMethod>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [manualMnemonic, setManualMnemonic] = useState('');
  const [manualNetwork, setManualNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [backupData, setBackupData] = useState<string>('');
  const [backupFileName, setBackupFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'pairing' | 'password'>('pairing');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPairingCode(text);
    } catch (err) {
      setError('Failed to read clipboard. Please paste manually.');
    }
  };

  const handlePairingSubmit = () => {
    try {
      setError(null);
      const payload = parsePairingPayload(pairingCode);

      if (payload.pairing.type !== 'swaps.gui') {
        throw new Error(
          `Invalid pairing type. Expected 'swaps.gui', got '${payload.pairing.type}'`
        );
      }

      setStep('password');
    } catch (err: any) {
      setError(err.message || 'Invalid pairing code');
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = parsePairingPayload(pairingCode);

      // Decrypt the mnemonic
      const mnemonic = await decryptMnemonic(
        payload.pairing.mnemonic,
        password
      );

      // Derive swap wallet accounts
      const network = payload.pairing.network === 'mainnet' ? 'mainnet' : 'testnet';
      const walletData = deriveSwapWallet(
        mnemonic,
        payload.pairing.passphrase ? passphrase : '',
        network
      );

      const wallet: WalletState = {
        isConnected: true,
        network,
        fingerprint: walletData.fingerprint,
        depositAddress: walletData.depositAddress,
        refundAddress: walletData.refundAddress,
        asbAddress: walletData.asbAddress,
        depositXpub: walletData.depositXpub,
        refundXpub: walletData.refundXpub,
        asbXpub: walletData.asbXpub,
      };

      // Pass mnemonic and passphrase for SwapWallet creation
      const actualPassphrase = payload.pairing.passphrase ? passphrase : '';
      onConnect(wallet, mnemonic, actualPassphrase);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const mnemonic = manualMnemonic.trim().toLowerCase();

      // Validate mnemonic
      if (!bip39.validateMnemonic(mnemonic, wordlist)) {
        throw new Error('Invalid mnemonic. Please check your seed words.');
      }

      // Derive swap wallet accounts
      const walletData = deriveSwapWallet(mnemonic, passphrase, manualNetwork);

      const wallet: WalletState = {
        isConnected: true,
        network: manualNetwork,
        fingerprint: walletData.fingerprint,
        depositAddress: walletData.depositAddress,
        refundAddress: walletData.refundAddress,
        asbAddress: walletData.asbAddress,
        depositXpub: walletData.depositXpub,
        refundXpub: walletData.refundXpub,
        asbXpub: walletData.asbXpub,
      };

      onConnect(wallet, mnemonic, passphrase);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBackupFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setBackupData(content);
    };
    reader.readAsText(file);
  };

  const handleBackupConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!backupData) {
        throw new Error('Please select a backup file');
      }

      // Use backup password for decryption (or fallback to passphrase if not provided)
      const decryptionPassword = password || passphrase;
      if (!decryptionPassword) {
        throw new Error('Please enter the backup encryption password');
      }

      // Use server-side API for decryption (more reliable than browser crypto)
      const response = await fetch('/api/decrypt-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupContent: backupData,
          password: decryptionPassword
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to decrypt backup');
      }

      const mnemonic = result.mnemonic;
      const network: 'mainnet' | 'testnet' = result.network || 'mainnet';

      // Derive swap wallet accounts
      const walletData = deriveSwapWallet(mnemonic, passphrase, network);

      const wallet: WalletState = {
        isConnected: true,
        network,
        fingerprint: walletData.fingerprint,
        depositAddress: walletData.depositAddress,
        refundAddress: walletData.refundAddress,
        asbAddress: walletData.asbAddress,
        depositXpub: walletData.depositXpub,
        refundXpub: walletData.refundXpub,
        asbXpub: walletData.asbXpub,
      };

      onConnect(wallet, mnemonic, passphrase);
    } catch (err: any) {
      console.error('Backup restore error:', err);
      const errorMsg = err.message || 'Failed to restore from backup';
      alert('Restore error: ' + errorMsg);  // Temporary debug alert
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-6 text-center">Connect Wallet</h2>

      {!method ? (
        <div className="space-y-4">
          <p className="text-gray-400 text-center mb-6">
            Connect your Samourai Wallet using a pairing code
          </p>

          <button
            onClick={() => setMethod('paste')}
            className="w-full btn-primary flex items-center justify-center gap-3"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            Paste Pairing Code
          </button>

          <button
            onClick={() => setMethod('backup')}
            className="w-full btn-secondary flex items-center justify-center gap-3"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Restore from Backup
          </button>

          <button
            onClick={() => setMethod('manual')}
            className="w-full btn-secondary flex items-center justify-center gap-3 opacity-75"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            Enter Seed Words (Advanced)
          </button>

          <button
            onClick={() => setMethod('scan')}
            className="w-full btn-secondary flex items-center justify-center gap-3 opacity-50"
            disabled
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
              />
            </svg>
            Scan QR Code (Coming Soon)
          </button>
        </div>
      ) : method === 'backup' ? (
        <motion.div
          key="backup"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-4"
        >
          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg px-4 py-3 text-blue-400 text-sm">
            <span className="font-semibold">Restore from Backup</span>
            <br />
            Select your encrypted Samourai wallet backup file and enter your passphrase.
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Wallet Backup File
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".json,.txt"
                onChange={handleBackupFileSelect}
                className="hidden"
                id="backup-file-input"
              />
              <label
                htmlFor="backup-file-input"
                className="flex items-center justify-center gap-2 w-full bg-dark-800 border border-dark-600 border-dashed rounded-lg px-4 py-6 text-gray-400 cursor-pointer hover:border-bitcoin hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {backupFileName || 'Click to select backup file'}
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Usually named samourai.txt or similar
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Backup Encryption Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password used when creating the backup"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-white focus:border-bitcoin focus:ring-1 focus:ring-bitcoin focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              The password you set when creating this backup file
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Wallet Passphrase (BIP39)
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Your wallet's BIP39 passphrase"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-white focus:border-bitcoin focus:ring-1 focus:ring-bitcoin focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your wallet passphrase (often the same as backup password)
            </p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setMethod(null);
                setBackupData('');
                setBackupFileName('');
                setPassword('');
                setPassphrase('');
                setError(null);
              }}
              className="btn-secondary flex-1"
              disabled={isLoading}
            >
              Back
            </button>
            <button
              onClick={handleBackupConnect}
              className="btn-primary flex-1"
              disabled={!backupData || (!password && !passphrase) || isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Restoring...
                </span>
              ) : (
                'Restore Wallet'
              )}
            </button>
          </div>
        </motion.div>
      ) : method === 'manual' ? (
        <motion.div
          key="manual"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-4"
        >
          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-4 py-3 text-yellow-400 text-sm">
            <span className="font-semibold">Manual Entry Mode</span>
            <br />
            Enter your 12 or 24 word seed phrase directly.
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Seed Words (Mnemonic)
            </label>
            <textarea
              value={manualMnemonic}
              onChange={(e) => setManualMnemonic(e.target.value)}
              placeholder="word1 word2 word3 ... (12 or 24 words)"
              className="w-full h-24 bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-white text-sm font-mono resize-none focus:border-bitcoin focus:ring-1 focus:ring-bitcoin focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              BIP39 Passphrase (Optional)
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter your passphrase if you have one"
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-white focus:border-bitcoin focus:ring-1 focus:ring-bitcoin focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Network
            </label>
            <select
              value={manualNetwork}
              onChange={(e) => setManualNetwork(e.target.value as 'mainnet' | 'testnet')}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-white focus:border-bitcoin focus:ring-1 focus:ring-bitcoin focus:outline-none"
            >
              <option value="mainnet">Mainnet</option>
              <option value="testnet">Testnet</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setMethod(null);
                setManualMnemonic('');
                setPassphrase('');
                setError(null);
              }}
              className="btn-secondary flex-1"
              disabled={isLoading}
            >
              Back
            </button>
            <button
              onClick={handleManualConnect}
              className="btn-primary flex-1"
              disabled={!manualMnemonic.trim() || isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Connecting...
                </span>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          {step === 'pairing' ? (
            <motion.div
              key="pairing"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Pairing Code (JSON)
                </label>
                <div className="relative">
                  <textarea
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value)}
                    placeholder='{"pairing":{"type":"swaps.gui",...}}'
                    className="w-full h-32 bg-dark-800 border border-dark-600 rounded-lg px-4 py-3 text-white text-sm font-mono resize-none focus:border-bitcoin focus:ring-1 focus:ring-bitcoin focus:outline-none"
                  />
                  <button
                    onClick={handlePaste}
                    className="absolute top-2 right-2 text-gray-400 hover:text-white p-1"
                    title="Paste from clipboard"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setMethod(null);
                    setPairingCode('');
                    setError(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  Back
                </button>
                <button
                  onClick={handlePairingSubmit}
                  className="btn-primary flex-1"
                  disabled={!pairingCode.trim()}
                >
                  Continue
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="bg-green-900/20 border border-green-800/50 rounded-lg px-4 py-3 text-green-400 text-sm">
                <span className="font-semibold">Valid pairing code detected!</span>
                <br />
                Type: swaps.gui | Network: {parsePairingPayload(pairingCode).pairing.network}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Wallet Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your wallet password"
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used to decrypt your mnemonic
                </p>
              </div>

              {parsePairingPayload(pairingCode).pairing.passphrase && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    BIP39 Passphrase (Optional)
                  </label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter your BIP39 passphrase"
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your pairing indicates a passphrase is set
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep('pairing');
                    setPassword('');
                    setPassphrase('');
                    setError(null);
                  }}
                  className="btn-secondary flex-1"
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  onClick={handleConnect}
                  className="btn-primary flex-1"
                  disabled={!password || isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Connecting...
                    </span>
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <div className="mt-6 pt-6 border-t border-dark-600">
        <p className="text-xs text-gray-500 text-center">
          Your keys never leave your device. All cryptographic operations are
          performed locally in your browser.
        </p>
      </div>
    </div>
  );
}
