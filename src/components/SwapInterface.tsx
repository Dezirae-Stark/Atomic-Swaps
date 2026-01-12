'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { WalletState, SwapStep } from '@/types';
import { SwapWallet } from '@/lib/bitcoin/swapWallet';
import { useSwapExecutor, useSwapHistory } from '@/hooks/useSwapExecutor';
import { SwapPhase, SwapState } from '@/lib/swap/state';
import { isValidMoneroAddress } from '@/lib/monero/address';
import { QRScanner } from './QRScanner';

interface SwapInterfaceProps {
  wallet: WalletState;
  swapWallet: SwapWallet | null;
}

interface Provider {
  peerId: string;
  multiaddr: string;
  price: string;
  minBtc: string;
  maxBtc: string;
  uptime: string;
  isOnline: boolean;
}

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

// Phase to step mapping
function phaseToStep(phase: SwapPhase | null): SwapStep {
  if (!phase) return 'select_provider';

  switch (phase) {
    case SwapPhase.COMPLETED:
      return 'completed';
    case SwapPhase.FAILED:
    case SwapPhase.REFUNDED:
      return 'select_provider';
    default:
      return 'executing';
  }
}

// Phase progress percentage
function getPhaseProgress(phase: SwapPhase): number {
  const phaseOrder: SwapPhase[] = [
    SwapPhase.SWAP_INITIATED,
    SwapPhase.BTC_LOCK_TX_CREATED,
    SwapPhase.BTC_LOCK_TX_BROADCAST,
    SwapPhase.BTC_LOCK_TX_CONFIRMED,
    SwapPhase.XMR_LOCK_TX_SEEN,
    SwapPhase.XMR_LOCK_TX_CONFIRMED,
    SwapPhase.ENCRYPTED_SIG_SENT,
    SwapPhase.BTC_REDEEMED,
    SwapPhase.XMR_REDEEMABLE,
    SwapPhase.COMPLETED,
  ];

  const index = phaseOrder.indexOf(phase);
  if (index === -1) return 0;
  return Math.round((index / (phaseOrder.length - 1)) * 100);
}

export function SwapInterface({ wallet, swapWallet }: SwapInterfaceProps) {
  const [step, setStep] = useState<SwapStep>('select_provider');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [btcAmount, setBtcAmount] = useState('');
  const [xmrAddress, setXmrAddress] = useState('');
  const [showXmrScanner, setShowXmrScanner] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingQuote, setPendingQuote] = useState<any>(null);

  // Initialize swap executor
  const {
    isInitialized,
    isExecuting,
    currentSwap,
    activeSwaps,
    initialize,
    requestQuote,
    executeSwap,
    refundSwap,
    currentPhase,
    phaseDescription,
    error: executorError,
  } = useSwapExecutor({
    wallet: swapWallet,
    config: {
      isMainnet: wallet.network === 'mainnet',
      mempoolUrl: process.env.NEXT_PUBLIC_MEMPOOL_URL,
    },
    onPhaseChange: (phase, state) => {
      console.log(`Phase changed: ${phase}`, state);
      setStep(phaseToStep(phase));
    },
    onComplete: (state) => {
      console.log('Swap completed:', state);
    },
    onError: (err) => {
      console.error('Swap error:', err);
    },
  });

  // Swap history
  const { swaps: swapHistory } = useSwapHistory();

  // Fetch providers from API
  const { data: providerData, error: providerError, isLoading: providersLoading } = useSWR(
    '/api/providers',
    fetcher,
    { refreshInterval: 60000 }
  );

  const providers: Provider[] = providerData?.providers || [];

  // Initialize executor when wallet is ready
  useEffect(() => {
    if (swapWallet && !isInitialized) {
      initialize().catch(err => {
        console.error('Failed to initialize swap executor:', err);
        setLocalError('Failed to initialize swap executor');
      });
    }
  }, [swapWallet, isInitialized, initialize]);

  // Calculate XMR amount based on current rate
  const calculateXmr = useCallback(() => {
    if (!selectedProvider || !btcAmount) return '0';
    const btc = parseFloat(btcAmount);
    if (isNaN(btc) || btc <= 0) return '0';
    const rate = parseFloat(selectedProvider.price);
    return (btc / rate).toFixed(8);
  }, [selectedProvider, btcAmount]);

  const handleProviderSelect = (provider: Provider) => {
    setSelectedProvider(provider);
    setStep('enter_details');
  };

  const handleGetQuote = async () => {
    if (!selectedProvider || !btcAmount || !xmrAddress) return;

    setLocalError(null);

    try {
      // Validate XMR address
      const expectedNetwork = wallet.network === 'mainnet' ? 'mainnet' : 'testnet';
      if (!isValidMoneroAddress(xmrAddress, expectedNetwork)) {
        throw new Error('Invalid Monero address for this network');
      }

      // Validate BTC amount
      const btcSatoshis = BigInt(Math.round(parseFloat(btcAmount) * 1e8));
      const minSatoshis = BigInt(Math.round(parseFloat(selectedProvider.minBtc) * 1e8));
      const maxSatoshis = BigInt(Math.round(parseFloat(selectedProvider.maxBtc) * 1e8));

      if (btcSatoshis < minSatoshis) {
        throw new Error(`Minimum amount is ${selectedProvider.minBtc} BTC`);
      }
      if (btcSatoshis > maxSatoshis) {
        throw new Error(`Maximum amount is ${selectedProvider.maxBtc} BTC`);
      }

      // Request actual quote from provider
      const quote = await requestQuote(
        selectedProvider.peerId,
        selectedProvider.multiaddr,
        btcSatoshis
      );

      setPendingQuote({
        ...quote,
        btcAmountDisplay: btcAmount,
        xmrAmountDisplay: calculateXmr(),
        provider: selectedProvider,
      });

      setStep('confirm');
    } catch (err: any) {
      setLocalError(err.message || 'Failed to get quote');
    }
  };

  const handleExecuteSwap = async () => {
    if (!pendingQuote || !swapWallet) return;

    setLocalError(null);
    setStep('executing');

    try {
      // In production, we'd get UTXOs from the wallet
      // For now, this is a placeholder
      const utxos: any[] = [];

      // Execute the swap
      await executeSwap(pendingQuote, xmrAddress, utxos);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to execute swap');
      setStep('confirm');
    }
  };

  const handleRefund = async (swapId: string) => {
    try {
      const txId = await refundSwap(swapId);
      alert(`Refund transaction broadcast: ${txId}`);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to refund');
    }
  };

  const handleReset = () => {
    setStep('select_provider');
    setSelectedProvider(null);
    setBtcAmount('');
    setXmrAddress('');
    setPendingQuote(null);
    setLocalError(null);
  };

  const error = localError || (executorError?.message);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">
          {step === 'select_provider' && 'Select Provider'}
          {step === 'enter_details' && 'Swap Details'}
          {step === 'confirm' && 'Confirm Swap'}
          {step === 'executing' && 'Executing Swap'}
          {step === 'completed' && 'Swap Complete'}
        </h2>
        {step !== 'select_provider' && step !== 'executing' && (
          <button
            onClick={handleReset}
            className="text-gray-400 hover:text-white text-sm"
          >
            Start Over
          </button>
        )}
      </div>

      {/* Active Swaps Banner */}
      {activeSwaps.length > 0 && step === 'select_provider' && (
        <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-4 py-3 mb-4">
          <p className="text-yellow-400 text-sm font-medium">
            You have {activeSwaps.length} active swap(s) in progress
          </p>
          <div className="mt-2 space-y-1">
            {activeSwaps.slice(0, 3).map(swap => (
              <div key={swap.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{swap.id.slice(0, 16)}...</span>
                <span className="text-yellow-400">{swap.phase}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Provider Selection */}
        {step === 'select_provider' && (
          <motion.div
            key="providers"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-400 text-sm">
                Select an Automated Swap Backend (ASB) provider
              </p>
              {providersLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Discovering...
                </div>
              )}
            </div>

            {providerError && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
                Failed to discover providers. Please try again.
              </div>
            )}

            {providers.length === 0 && !providersLoading ? (
              <div className="text-center py-8 text-gray-500">
                No providers available. Please try again later.
              </div>
            ) : (
              providers.map((provider) => (
                <button
                  key={provider.peerId}
                  onClick={() => handleProviderSelect(provider)}
                  disabled={!provider.isOnline}
                  className={`w-full text-left card-hover p-4 rounded-lg border transition-all ${
                    !provider.isOnline
                      ? 'border-dark-700 opacity-50 cursor-not-allowed'
                      : 'border-dark-600 hover:border-bitcoin/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          provider.isOnline ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                        <p className="font-semibold text-sm truncate max-w-xs">
                          {provider.peerId.slice(0, 16)}...
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {provider.minBtc} - {provider.maxBtc} BTC
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-bitcoin font-mono">
                        1 BTC = {(1 / parseFloat(provider.price)).toFixed(2)} XMR
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {provider.isOnline ? `Uptime: ${provider.uptime}%` : 'Offline'}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}

            <div className="bg-dark-800 rounded-lg p-4 text-sm text-gray-400">
              <p className="font-semibold mb-2">How Atomic Swaps Work:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>You send BTC to a time-locked HTLC address</li>
                <li>Provider locks XMR in an equivalent contract</li>
                <li>You reveal the secret to claim XMR</li>
                <li>Provider uses the secret to claim BTC</li>
              </ol>
            </div>
          </motion.div>
        )}

        {/* Enter Details */}
        {step === 'enter_details' && selectedProvider && (
          <motion.div
            key="details"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="bg-dark-800 rounded-lg p-4 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Provider Rate:</span>
                <span className="text-bitcoin font-mono">
                  1 BTC = {(1 / parseFloat(selectedProvider.price)).toFixed(2)} XMR
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-gray-400">Limits:</span>
                <span className="font-mono">
                  {selectedProvider.minBtc} - {selectedProvider.maxBtc} BTC
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                You Send (BTC)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={btcAmount}
                  onChange={(e) => setBtcAmount(e.target.value)}
                  placeholder="0.00000000"
                  className="w-full pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-bitcoin font-semibold">
                  BTC
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center py-2">
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                You Receive (XMR)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={calculateXmr()}
                  readOnly
                  className="w-full pr-16 bg-dark-900 cursor-not-allowed"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-monero font-semibold">
                  XMR
                </span>
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between text-sm text-gray-400 mb-2">
                <span>Monero Receive Address</span>
                <button
                  type="button"
                  onClick={() => setShowXmrScanner(true)}
                  className="flex items-center gap-1 text-samourai-red hover:text-ronin-red transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  Scan QR
                </button>
              </label>
              <input
                type="text"
                value={xmrAddress}
                onChange={(e) => setXmrAddress(e.target.value)}
                placeholder="4..."
                className="w-full font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your XMR will be sent to this address
              </p>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('select_provider')}
                className="btn-secondary flex-1"
              >
                Back
              </button>
              <button
                onClick={handleGetQuote}
                className="btn-primary flex-1"
                disabled={!btcAmount || !xmrAddress || !isInitialized}
              >
                {isInitialized ? 'Get Quote' : 'Initializing...'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Confirm Swap */}
        {step === 'confirm' && pendingQuote && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="bg-dark-800 rounded-lg p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">You Send</span>
                <span className="text-xl font-bold text-bitcoin">
                  {pendingQuote.btcAmountDisplay} BTC
                </span>
              </div>
              <div className="flex justify-center">
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">You Receive</span>
                <span className="text-xl font-bold text-monero">
                  {pendingQuote.xmrAmountDisplay} XMR
                </span>
              </div>
              <div className="border-t border-dark-600 pt-4 mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Exchange Rate</span>
                  <span className="font-mono">
                    {pendingQuote.exchangeRate.toFixed(8)} XMR/BTC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Quote Expires</span>
                  <span className="font-mono">
                    {new Date(pendingQuote.expiresAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-4 py-3 text-yellow-400 text-sm">
              <strong>Important:</strong> Once confirmed, your BTC will be locked.
              The swap typically completes within 20-30 minutes.
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('enter_details')}
                className="btn-secondary flex-1"
              >
                Back
              </button>
              <button
                onClick={handleExecuteSwap}
                className="btn-primary flex-1 bg-monero hover:bg-monero/90"
                disabled={isExecuting}
              >
                {isExecuting ? 'Starting...' : 'Confirm Swap'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Executing */}
        {step === 'executing' && currentSwap && (
          <motion.div
            key="executing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Progress bar */}
            <div className="bg-dark-800 rounded-lg p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Progress</span>
                <span className="text-bitcoin">{getPhaseProgress(currentSwap.phase)}%</span>
              </div>
              <div className="w-full bg-dark-900 rounded-full h-2">
                <div
                  className="bg-bitcoin h-2 rounded-full transition-all duration-500"
                  style={{ width: `${getPhaseProgress(currentSwap.phase)}%` }}
                />
              </div>
            </div>

            {/* Current phase */}
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-4 border-bitcoin/30 rounded-full" />
                <div className="absolute inset-0 border-4 border-bitcoin border-t-transparent rounded-full animate-spin" />
              </div>
              <h3 className="text-lg font-semibold">{phaseDescription}</h3>
              <p className="text-gray-400 text-sm mt-2">Swap ID: {currentSwap.id}</p>
            </div>

            {/* Phase steps */}
            <div className="space-y-2 text-sm">
              <PhaseStep
                phase={SwapPhase.BTC_LOCK_TX_BROADCAST}
                currentPhase={currentSwap.phase}
                label="BTC Lock Transaction"
                txId={currentSwap.btcLockTxId}
              />
              <PhaseStep
                phase={SwapPhase.BTC_LOCK_TX_CONFIRMED}
                currentPhase={currentSwap.phase}
                label="BTC Confirmations"
              />
              <PhaseStep
                phase={SwapPhase.XMR_LOCK_TX_CONFIRMED}
                currentPhase={currentSwap.phase}
                label="XMR Lock Confirmed"
              />
              <PhaseStep
                phase={SwapPhase.ENCRYPTED_SIG_SENT}
                currentPhase={currentSwap.phase}
                label="Signature Exchange"
              />
              <PhaseStep
                phase={SwapPhase.BTC_REDEEMED}
                currentPhase={currentSwap.phase}
                label="BTC Redeemed"
                txId={currentSwap.btcRedeemTxId}
              />
              <PhaseStep
                phase={SwapPhase.COMPLETED}
                currentPhase={currentSwap.phase}
                label="XMR Claimed"
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <p className="text-center text-gray-500 text-xs">
              Do not close this window. Your swap is being processed.
            </p>
          </motion.div>
        )}

        {/* Completed */}
        {step === 'completed' && currentSwap && (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center py-8"
          >
            <div className="w-16 h-16 mx-auto mb-6 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Swap Complete!</h3>
            <p className="text-gray-400 text-sm mb-6">
              Successfully swapped BTC for XMR
            </p>
            <div className="bg-dark-800 rounded-lg p-4 text-sm text-left max-w-sm mx-auto space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Swap ID</span>
                <span className="font-mono text-xs">{currentSwap.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Sent</span>
                <span className="text-bitcoin font-mono">
                  {(Number(currentSwap.btcAmount) / 1e8).toFixed(8)} BTC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Received</span>
                <span className="text-monero font-mono">
                  {(Number(currentSwap.xmrAmount) / 1e12).toFixed(8)} XMR
                </span>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="btn-primary mt-6"
            >
              New Swap
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Scanner for Monero Address */}
      <QRScanner
        isOpen={showXmrScanner}
        onClose={() => setShowXmrScanner(false)}
        onScan={(data) => {
          setXmrAddress(data);
          setShowXmrScanner(false);
        }}
        title="Scan Monero Address"
        description="Scan a Monero address QR code or select an image"
        validate={(data) => {
          const expectedNetwork = wallet.network === 'mainnet' ? 'mainnet' : 'testnet';
          if (isValidMoneroAddress(data, expectedNetwork)) {
            return { valid: true };
          }
          return {
            valid: false,
            error: `Invalid Monero address for ${expectedNetwork}`,
          };
        }}
      />
    </div>
  );
}

// Phase step indicator component
function PhaseStep({
  phase,
  currentPhase,
  label,
  txId,
}: {
  phase: SwapPhase;
  currentPhase: SwapPhase;
  label: string;
  txId?: string;
}) {
  const phaseOrder = [
    SwapPhase.SWAP_INITIATED,
    SwapPhase.BTC_LOCK_TX_CREATED,
    SwapPhase.BTC_LOCK_TX_BROADCAST,
    SwapPhase.BTC_LOCK_TX_CONFIRMED,
    SwapPhase.XMR_LOCK_TX_SEEN,
    SwapPhase.XMR_LOCK_TX_CONFIRMED,
    SwapPhase.ENCRYPTED_SIG_SENT,
    SwapPhase.BTC_REDEEMED,
    SwapPhase.XMR_REDEEMABLE,
    SwapPhase.COMPLETED,
  ];

  const currentIdx = phaseOrder.indexOf(currentPhase);
  const phaseIdx = phaseOrder.indexOf(phase);

  const isCompleted = phaseIdx < currentIdx || currentPhase === SwapPhase.COMPLETED;
  const isActive = phaseIdx === currentIdx;

  return (
    <div className={`flex items-center gap-3 ${isCompleted ? 'text-green-400' : isActive ? 'text-yellow-400' : 'text-gray-500'}`}>
      {isCompleted ? (
        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : isActive ? (
        <svg className="w-5 h-5 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      <span>{label}</span>
      {txId && (
        <a
          href={`https://mempool.space/tx/${txId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:underline"
        >
          View Tx
        </a>
      )}
    </div>
  );
}
