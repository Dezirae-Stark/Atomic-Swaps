'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  parsePairingPayload,
  decryptMnemonic,
  deriveSwapWallet,
} from '@/lib/wallet';
import { WalletState } from '@/types';

interface WalletConnectProps {
  onConnect: (wallet: WalletState, mnemonic?: string, passphrase?: string) => void;
}

type ConnectionMethod = 'paste' | 'scan' | null;

export function WalletConnect({ onConnect }: WalletConnectProps) {
  const [method, setMethod] = useState<ConnectionMethod>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
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
            onClick={() => setMethod('scan')}
            className="w-full btn-secondary flex items-center justify-center gap-3"
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
