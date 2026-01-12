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
        <header className="text-center mb-12 text-readable">
          <div className="flex items-center justify-center gap-4 mb-4">
            {/* Bitcoin Icon */}
            <svg className="w-14 h-14 drop-shadow-lg" viewBox="0 0 64 64" fill="currentColor">
              <circle cx="32" cy="32" r="32" fill="#F7931A"/>
              <path fill="#ffffff" d="M46.1 27.4c.6-4.1-2.5-6.3-6.8-7.8l1.4-5.6-3.4-.9-1.4 5.4c-.9-.2-1.8-.4-2.7-.7l1.4-5.5-3.4-.9-1.4 5.6c-.7-.2-1.5-.4-2.2-.5v0l-4.7-1.2-.9 3.6s2.5.6 2.5.6c1.4.3 1.6 1.3 1.6 2l-1.6 6.4c.1 0 .2 0 .3.1-.1 0-.2-.1-.3-.1l-2.2 8.9c-.2.4-.6 1.1-1.6.8 0 0-2.5-.6-2.5-.6l-1.7 3.9 4.4 1.1c.8.2 1.6.4 2.4.6l-1.4 5.7 3.4.9 1.4-5.6c.9.2 1.8.5 2.7.7l-1.4 5.5 3.4.9 1.4-5.7c5.9 1.1 10.4.7 12.3-4.7 1.5-4.3-.1-6.8-3.2-8.4 2.3-.5 4-2.1 4.4-5.2zM39 36.7c-1.1 4.3-8.3 2-10.7 1.4l1.9-7.6c2.4.6 9.9 1.8 8.8 6.2zm1.1-9.4c-1 3.9-7 1.9-9 1.4l1.7-6.9c2 .5 8.4 1.4 7.3 5.5z"/>
            </svg>
            {/* Swap Arrow */}
            <svg className="w-8 h-8 text-samourai-red drop-shadow-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {/* Monero Icon */}
            <svg className="w-14 h-14 text-monero drop-shadow-lg" viewBox="0 0 256 256" fill="currentColor">
              <path d="M127.998 0C57.318 0 0 57.317 0 127.999c0 14.127 2.29 27.716 6.518 40.43H44.8V60.733l83.2 83.2 83.199-83.2v107.695h38.282c4.228-12.714 6.519-26.303 6.519-40.43C256 57.317 198.681 0 127.998 0z"/>
              <path d="M108.867 163.062l-36.31-36.311v67.678H18.623c22.47 36.863 63.051 61.571 109.375 61.571s86.905-24.708 109.374-61.571h-53.933v-67.678l-36.31 36.31-19.131 19.132-19.131-19.131z"/>
            </svg>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">
            <span className="text-bitcoin">BTC</span>
            <span className="text-samourai-red mx-3">&harr;</span>
            <span className="text-monero">XMR</span>
          </h1>
          <p className="text-gray-200 text-lg">
            Trustless Atomic Swaps with <span className="text-samourai-red font-semibold">Samourai</span> Wallet
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
        <footer className="mt-16 text-center text-sm text-readable">
          <p className="mb-2 text-gray-300">
            Powered by{' '}
            <a
              href="https://github.com/UnstoppableSwap/core"
              target="_blank"
              rel="noopener noreferrer"
              className="text-samourai-red hover:text-ronin-red transition-colors"
            >
              UnstoppableSwap
            </a>
            {' '}Protocol
          </p>
          <p className="text-gray-300">
            Compatible with <span className="text-samourai-red">Samourai Wallet</span> &amp; <span className="text-samourai-red">Ashigaru</span>
          </p>
        </footer>

        {/* Quote */}
        <div className="mt-24 mb-16 text-center max-w-2xl mx-auto text-readable">
          <blockquote
            className="text-xl md:text-3xl text-gray-100 leading-relaxed tracking-wide"
            style={{ fontFamily: 'Jansina, sans-serif' }}
          >
            &ldquo;The man with one way to fight has many ways to die. Build a mind that shifts like water, or prepare to break like stone.&rdquo;
          </blockquote>
        </div>
      </div>
    </main>
  );
}
