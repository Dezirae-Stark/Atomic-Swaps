// React Hook for Swap Execution
// Provides a reactive interface to the swap executor

import { useState, useCallback, useEffect, useRef } from 'react';
import { SwapWallet } from '../lib/bitcoin/swapWallet';
import {
  SwapExecutor,
  SwapConfig,
  SwapQuote,
  createSwapExecutor,
} from '../lib/swap/executor';
import {
  SwapState,
  SwapPhase,
  getAllSwapStates,
  getActiveSwaps,
  loadSwapState,
} from '../lib/swap/state';

export interface UseSwapExecutorOptions {
  wallet: SwapWallet | null;
  config: SwapConfig;
  onPhaseChange?: (phase: SwapPhase, state: SwapState) => void;
  onError?: (error: Error) => void;
  onComplete?: (state: SwapState) => void;
}

export interface UseSwapExecutorResult {
  // Executor state
  isInitialized: boolean;
  isExecuting: boolean;
  currentSwap: SwapState | null;
  allSwaps: SwapState[];
  activeSwaps: SwapState[];

  // Actions
  initialize: () => Promise<void>;
  shutdown: () => Promise<void>;
  requestQuote: (peerId: string, peerMultiaddr: string, btcAmount: bigint) => Promise<SwapQuote>;
  executeSwap: (
    quote: SwapQuote,
    xmrAddress: string,
    utxos: Array<{ txid: string; vout: number; value: bigint; script: Uint8Array }>
  ) => Promise<SwapState>;
  refundSwap: (swapId: string) => Promise<string>;
  resumeSwap: (swapId: string) => Promise<SwapState>;
  loadSwap: (swapId: string) => SwapState | null;
  refreshSwaps: () => void;

  // Current phase info
  currentPhase: SwapPhase | null;
  phaseDescription: string;
  error: Error | null;
}

export function useSwapExecutor(options: UseSwapExecutorOptions): UseSwapExecutorResult {
  const { wallet, config, onPhaseChange, onError, onComplete } = options;

  const executorRef = useRef<SwapExecutor | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentSwap, setCurrentSwap] = useState<SwapState | null>(null);
  const [allSwaps, setAllSwaps] = useState<SwapState[]>([]);
  const [activeSwaps, setActiveSwaps] = useState<SwapState[]>([]);
  const [currentPhase, setCurrentPhase] = useState<SwapPhase | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refresh swap lists
  const refreshSwaps = useCallback(() => {
    setAllSwaps(getAllSwapStates());
    setActiveSwaps(getActiveSwaps());
  }, []);

  // Initialize executor when wallet is available
  const initialize = useCallback(async () => {
    if (!wallet) {
      throw new Error('Wallet not available');
    }

    if (executorRef.current) {
      return; // Already initialized
    }

    const executor = createSwapExecutor(wallet, config, {
      onPhaseChange: (phase, state) => {
        setCurrentPhase(phase);
        setCurrentSwap(state);
        refreshSwaps();
        onPhaseChange?.(phase, state);
      },
      onError: (err, state) => {
        setError(err);
        setCurrentSwap(state);
        onError?.(err);
      },
      onComplete: (state) => {
        setIsExecuting(false);
        setCurrentSwap(state);
        refreshSwaps();
        onComplete?.(state);
      },
      onTransactionBroadcast: (txType, txId) => {
        console.log(`Transaction broadcast: ${txType} - ${txId}`);
      },
    });

    await executor.initialize();
    executorRef.current = executor;
    setIsInitialized(true);
    refreshSwaps();
  }, [wallet, config, onPhaseChange, onError, onComplete, refreshSwaps]);

  // Shutdown executor
  const shutdown = useCallback(async () => {
    if (executorRef.current) {
      await executorRef.current.shutdown();
      executorRef.current = null;
      setIsInitialized(false);
    }
  }, []);

  // Request quote
  const requestQuote = useCallback(
    async (peerId: string, peerMultiaddr: string, btcAmount: bigint): Promise<SwapQuote> => {
      if (!executorRef.current) {
        throw new Error('Executor not initialized');
      }
      setError(null);
      try {
        return await executorRef.current.requestQuote(peerId, peerMultiaddr, btcAmount);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    []
  );

  // Execute swap
  const executeSwap = useCallback(
    async (
      quote: SwapQuote,
      xmrAddress: string,
      utxos: Array<{ txid: string; vout: number; value: bigint; script: Uint8Array }>
    ): Promise<SwapState> => {
      if (!executorRef.current) {
        throw new Error('Executor not initialized');
      }

      setError(null);
      setIsExecuting(true);

      try {
        const state = await executorRef.current.executeSwap(quote, xmrAddress, utxos);
        setCurrentSwap(state);
        return state;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setIsExecuting(false);
        throw error;
      }
    },
    []
  );

  // Refund swap
  const refundSwap = useCallback(async (swapId: string): Promise<string> => {
    if (!executorRef.current) {
      throw new Error('Executor not initialized');
    }

    setError(null);
    try {
      return await executorRef.current.refundSwap(swapId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, []);

  // Resume swap
  const resumeSwap = useCallback(async (swapId: string): Promise<SwapState> => {
    if (!executorRef.current) {
      throw new Error('Executor not initialized');
    }

    setError(null);
    setIsExecuting(true);

    try {
      const state = await executorRef.current.resumeSwap(swapId);
      setCurrentSwap(state);
      return state;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsExecuting(false);
      throw error;
    }
  }, []);

  // Load a specific swap
  const loadSwap = useCallback((swapId: string): SwapState | null => {
    return loadSwapState(swapId);
  }, []);

  // Get phase description
  const getPhaseDescription = (phase: SwapPhase | null): string => {
    if (!phase) return '';

    const descriptions: Record<SwapPhase, string> = {
      [SwapPhase.QUOTE_REQUESTED]: 'Requesting quote from provider...',
      [SwapPhase.QUOTE_RECEIVED]: 'Quote received',
      [SwapPhase.SWAP_INITIATED]: 'Swap initiated with provider',
      [SwapPhase.BTC_LOCK_TX_CREATED]: 'Bitcoin lock transaction created',
      [SwapPhase.BTC_LOCK_TX_BROADCAST]: 'Bitcoin lock transaction broadcast',
      [SwapPhase.BTC_LOCK_TX_CONFIRMED]: 'Bitcoin lock confirmed',
      [SwapPhase.XMR_LOCK_TX_SEEN]: 'Monero lock transaction detected',
      [SwapPhase.XMR_LOCK_TX_CONFIRMED]: 'Monero lock confirmed',
      [SwapPhase.ENCRYPTED_SIG_SENT]: 'Encrypted signature sent',
      [SwapPhase.BTC_REDEEMED]: 'Provider redeemed Bitcoin',
      [SwapPhase.XMR_REDEEMABLE]: 'Monero ready to claim!',
      [SwapPhase.XMR_REDEEMED]: 'Monero claimed successfully',
      [SwapPhase.REFUND_TIMELOCK_EXPIRED]: 'Refund available',
      [SwapPhase.BTC_REFUNDED]: 'Bitcoin refunded',
      [SwapPhase.COMPLETED]: 'Swap completed successfully!',
      [SwapPhase.REFUNDED]: 'Swap refunded',
      [SwapPhase.FAILED]: 'Swap failed',
    };

    return descriptions[phase] || phase;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (executorRef.current) {
        executorRef.current.shutdown().catch(console.error);
      }
    };
  }, []);

  // Load swaps on mount
  useEffect(() => {
    refreshSwaps();
  }, [refreshSwaps]);

  return {
    isInitialized,
    isExecuting,
    currentSwap,
    allSwaps,
    activeSwaps,
    initialize,
    shutdown,
    requestQuote,
    executeSwap,
    refundSwap,
    resumeSwap,
    loadSwap,
    refreshSwaps,
    currentPhase,
    phaseDescription: getPhaseDescription(currentPhase),
    error,
  };
}

// Hook for swap history
export function useSwapHistory() {
  const [swaps, setSwaps] = useState<SwapState[]>([]);

  useEffect(() => {
    setSwaps(getAllSwapStates());
  }, []);

  const refresh = useCallback(() => {
    setSwaps(getAllSwapStates());
  }, []);

  const getSwapById = useCallback((id: string) => {
    return loadSwapState(id);
  }, []);

  return {
    swaps,
    refresh,
    getSwapById,
  };
}

// Hook for watching a specific swap
export function useWatchSwap(swapId: string | null) {
  const [swap, setSwap] = useState<SwapState | null>(null);

  useEffect(() => {
    if (!swapId) {
      setSwap(null);
      return;
    }

    // Initial load
    setSwap(loadSwapState(swapId));

    // Poll for updates (in production, use events/subscriptions)
    const interval = setInterval(() => {
      const updated = loadSwapState(swapId);
      if (updated) {
        setSwap(updated);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [swapId]);

  return swap;
}
