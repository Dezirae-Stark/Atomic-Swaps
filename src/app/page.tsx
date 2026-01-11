'use client';

import { useState, useCallback, useMemo } from 'react';
import { WalletConnect } from '@/components/WalletConnect';
import { SwapInterface } from '@/components/SwapInterface';
import { WalletInfo } from '@/components/WalletInfo';
import { WalletState } from '@/types';
import { SwapWallet } from '@/lib/bitcoin/swapWallet';

export default function Home() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string>('');

  // Create SwapWallet instance when mnemonic is available
  const swapWallet = useMemo(() => {
    if (!mnemonic) return null;
    try {
      return new SwapWallet(
        mnemonic,
        passphrase,
        wallet?.network === 'mainnet'
      );
    } catch (error) {
      console.error('Failed to create SwapWallet:', error);
      return null;
    }
  }, [mnemonic, passphrase, wallet?.network]);

  const handleWalletConnect = useCallback((walletState: WalletState, decryptedMnemonic?: string, walletPassphrase?: string) => {
    setWallet(walletState);
    if (decryptedMnemonic) {
      setMnemonic(decryptedMnemonic);
    }
    if (walletPassphrase !== undefined) {
      setPassphrase(walletPassphrase);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    setWallet(null);
    setMnemonic(null);
    setPassphrase('');
  }, []);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <span className="text-4xl">&#8383;</span>
            <span className="text-3xl text-gray-400">&harr;</span>
            <span className="text-4xl">&#8271;</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            <span className="text-bitcoin">BTC</span>
            <span className="text-gray-400 mx-2">&rarr;</span>
            <span className="text-monero">XMR</span>
          </h1>
          <p className="text-gray-400">
            Trustless Atomic Swaps with Samourai Wallet
          </p>
        </header>

        {/* Main Content */}
        {!wallet ? (
          <WalletConnect onConnect={handleWalletConnect} />
        ) : (
          <div className="space-y-6">
            <WalletInfo wallet={wallet} onDisconnect={handleDisconnect} />
            <SwapInterface wallet={wallet} swapWallet={swapWallet} />
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center text-gray-500 text-sm">
          <p className="mb-2">
            Powered by{' '}
            <a
              href="https://github.com/UnstoppableSwap/core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-bitcoin hover:underline"
            >
              UnstoppableSwap
            </a>
            {' '}Protocol
          </p>
          <p>
            Compatible with Samourai Wallet &amp; Ashigaru
          </p>
        </footer>
      </div>
    </main>
  );
}
