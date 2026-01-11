'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { WalletState } from '@/types';

interface WalletInfoProps {
  wallet: WalletState;
  onDisconnect: () => void;
}

export function WalletInfo({ wallet, onDisconnect }: WalletInfoProps) {
  const [showDetails, setShowDetails] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 12)}...${address.slice(-8)}`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="font-semibold">Wallet Connected</span>
          <span className={`text-xs px-2 py-1 rounded ${
            wallet.network === 'mainnet'
              ? 'bg-bitcoin/20 text-bitcoin'
              : 'bg-yellow-500/20 text-yellow-500'
          }`}>
            {wallet.network}
          </span>
        </div>
        <button
          onClick={onDisconnect}
          className="text-gray-400 hover:text-white text-sm"
        >
          Disconnect
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400 mb-1">Fingerprint</p>
          <p className="font-mono text-gray-300">{wallet.fingerprint}</p>
        </div>
        <div>
          <p className="text-gray-400 mb-1">Deposit Address</p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-gray-300">
              {truncateAddress(wallet.depositAddress)}
            </p>
            <button
              onClick={() => copyToClipboard(wallet.depositAddress)}
              className="text-gray-400 hover:text-white"
              title="Copy full address"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mt-4 text-sm text-gray-400 hover:text-white flex items-center gap-1"
      >
        {showDetails ? 'Hide' : 'Show'} Extended Details
        <svg
          className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDetails && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 pt-4 border-t border-dark-600 space-y-4"
        >
          <div>
            <p className="text-gray-400 text-sm mb-1">Swap Deposit Account (m/84'/0'/2147483643')</p>
            <div className="bg-dark-800 rounded-lg p-3 font-mono text-xs break-all text-gray-300">
              {wallet.depositXpub}
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-sm mb-1">Swap Refund Account (m/84'/0'/2147483642')</p>
            <div className="bg-dark-800 rounded-lg p-3 font-mono text-xs break-all text-gray-300">
              {wallet.refundXpub}
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-sm mb-1">ASB Account (m/84'/0'/2147483641')</p>
            <div className="bg-dark-800 rounded-lg p-3 font-mono text-xs break-all text-gray-300">
              {wallet.asbXpub}
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-4 py-3 text-yellow-400 text-xs">
            <strong>Security Note:</strong> These extended public keys are derived from your wallet.
            Keep them private to maintain your privacy.
          </div>
        </motion.div>
      )}
    </div>
  );
}
