// Swap State Management
// Tracks swap progress and enables resumption of interrupted swaps

import { hex } from '@scure/base';

// Swap phases following the COMIT XMR-BTC protocol
export enum SwapPhase {
  // Initial phases
  QUOTE_REQUESTED = 'quote_requested',
  QUOTE_RECEIVED = 'quote_received',
  SWAP_INITIATED = 'swap_initiated',

  // Bitcoin lock phase
  BTC_LOCK_TX_CREATED = 'btc_lock_tx_created',
  BTC_LOCK_TX_BROADCAST = 'btc_lock_tx_broadcast',
  BTC_LOCK_TX_CONFIRMED = 'btc_lock_tx_confirmed',

  // XMR lock phase (ASB locks XMR)
  XMR_LOCK_TX_SEEN = 'xmr_lock_tx_seen',
  XMR_LOCK_TX_CONFIRMED = 'xmr_lock_tx_confirmed',

  // Encrypted signature exchange
  ENCRYPTED_SIG_SENT = 'encrypted_sig_sent',

  // Completion phases
  BTC_REDEEMED = 'btc_redeemed', // ASB redeemed BTC (reveals secret)
  XMR_REDEEMABLE = 'xmr_redeemable', // User can redeem XMR
  XMR_REDEEMED = 'xmr_redeemed', // User redeemed XMR

  // Refund phases
  REFUND_TIMELOCK_EXPIRED = 'refund_timelock_expired',
  BTC_REFUNDED = 'btc_refunded',

  // Terminal states
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

// Full swap state
export interface SwapState {
  // Identifiers
  id: string;
  peerId: string; // ASB peer ID
  createdAt: number;
  updatedAt: number;

  // Current phase
  phase: SwapPhase;
  phaseHistory: Array<{
    phase: SwapPhase;
    timestamp: number;
    details?: string;
  }>;

  // Quote details
  btcAmount: bigint;
  xmrAmount: bigint;
  exchangeRate: number;
  minBtcLockConfirmations: number;
  minXmrLockConfirmations: number;

  // Timelocks
  btcCancelTimelock: number; // Block height
  btcPunishTimelock: number; // Block height
  xmrUnlockHeight: number;

  // Keys
  userBtcDepositPubkey: string;
  userBtcRefundPubkey: string;
  asbBtcRedeemPubkey: string;
  userXmrAddress: string;
  asbXmrViewKey?: string;

  // Secret
  secretHash: string;
  secret?: string; // Revealed when ASB redeems BTC

  // Bitcoin transactions
  btcLockTxId?: string;
  btcLockTxVout?: number;
  btcLockTxHex?: string;
  btcRedeemTxId?: string;
  btcRefundTxId?: string;
  htlcScript?: string;

  // Monero transactions
  xmrLockTxId?: string;
  xmrRedeemTxId?: string;

  // Encrypted signature
  encryptedSignature?: string;

  // Error tracking
  lastError?: string;
  errorCount: number;

  // Network
  network: 'mainnet' | 'testnet';
}

// Storage key prefix
const STORAGE_KEY_PREFIX = 'atomic_swap_';
const SWAP_LIST_KEY = 'atomic_swap_list';

// Create a new swap state
export function createSwapState(params: {
  peerId: string;
  btcAmount: bigint;
  xmrAmount: bigint;
  exchangeRate: number;
  userBtcDepositPubkey: Uint8Array;
  userBtcRefundPubkey: Uint8Array;
  asbBtcRedeemPubkey: Uint8Array;
  userXmrAddress: string;
  secretHash: Uint8Array;
  btcCancelTimelock: number;
  btcPunishTimelock: number;
  minBtcLockConfirmations: number;
  minXmrLockConfirmations: number;
  network: 'mainnet' | 'testnet';
}): SwapState {
  const id = generateSwapId();
  const now = Date.now();

  return {
    id,
    peerId: params.peerId,
    createdAt: now,
    updatedAt: now,
    phase: SwapPhase.SWAP_INITIATED,
    phaseHistory: [
      { phase: SwapPhase.SWAP_INITIATED, timestamp: now },
    ],
    btcAmount: params.btcAmount,
    xmrAmount: params.xmrAmount,
    exchangeRate: params.exchangeRate,
    minBtcLockConfirmations: params.minBtcLockConfirmations,
    minXmrLockConfirmations: params.minXmrLockConfirmations,
    btcCancelTimelock: params.btcCancelTimelock,
    btcPunishTimelock: params.btcPunishTimelock,
    xmrUnlockHeight: 0, // Set when XMR is locked
    userBtcDepositPubkey: hex.encode(params.userBtcDepositPubkey),
    userBtcRefundPubkey: hex.encode(params.userBtcRefundPubkey),
    asbBtcRedeemPubkey: hex.encode(params.asbBtcRedeemPubkey),
    userXmrAddress: params.userXmrAddress,
    secretHash: hex.encode(params.secretHash),
    network: params.network,
    errorCount: 0,
  };
}

// Generate unique swap ID
function generateSwapId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(8));
  const randomStr = hex.encode(random).slice(0, 8);
  return `swap_${timestamp}_${randomStr}`;
}

// Transition to a new phase
export function transitionPhase(
  state: SwapState,
  newPhase: SwapPhase,
  details?: string
): SwapState {
  const now = Date.now();

  return {
    ...state,
    phase: newPhase,
    updatedAt: now,
    phaseHistory: [
      ...state.phaseHistory,
      { phase: newPhase, timestamp: now, details },
    ],
  };
}

// Update swap with new data
export function updateSwapState(
  state: SwapState,
  updates: Partial<Omit<SwapState, 'id' | 'createdAt' | 'phaseHistory'>>
): SwapState {
  return {
    ...state,
    ...updates,
    updatedAt: Date.now(),
  };
}

// Record error
export function recordSwapError(state: SwapState, error: string): SwapState {
  return {
    ...state,
    lastError: error,
    errorCount: state.errorCount + 1,
    updatedAt: Date.now(),
  };
}

// Storage operations using localStorage (or IndexedDB in production)
export function saveSwapState(state: SwapState): void {
  if (typeof window === 'undefined') return;

  // Save individual swap
  const key = `${STORAGE_KEY_PREFIX}${state.id}`;
  const serialized = serializeSwapState(state);
  localStorage.setItem(key, serialized);

  // Update swap list
  const list = getSwapIdList();
  if (!list.includes(state.id)) {
    list.push(state.id);
    localStorage.setItem(SWAP_LIST_KEY, JSON.stringify(list));
  }
}

export function loadSwapState(swapId: string): SwapState | null {
  if (typeof window === 'undefined') return null;

  const key = `${STORAGE_KEY_PREFIX}${swapId}`;
  const serialized = localStorage.getItem(key);
  if (!serialized) return null;

  return deserializeSwapState(serialized);
}

export function deleteSwapState(swapId: string): void {
  if (typeof window === 'undefined') return;

  const key = `${STORAGE_KEY_PREFIX}${swapId}`;
  localStorage.removeItem(key);

  // Update list
  const list = getSwapIdList().filter(id => id !== swapId);
  localStorage.setItem(SWAP_LIST_KEY, JSON.stringify(list));
}

export function getAllSwapStates(): SwapState[] {
  if (typeof window === 'undefined') return [];

  const list = getSwapIdList();
  return list
    .map(id => loadSwapState(id))
    .filter((state): state is SwapState => state !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getActiveSwaps(): SwapState[] {
  return getAllSwapStates().filter(swap =>
    !isTerminalPhase(swap.phase)
  );
}

export function getPendingSwaps(): SwapState[] {
  return getAllSwapStates().filter(swap =>
    swap.phase !== SwapPhase.COMPLETED &&
    swap.phase !== SwapPhase.REFUNDED &&
    swap.phase !== SwapPhase.FAILED
  );
}

function getSwapIdList(): string[] {
  if (typeof window === 'undefined') return [];

  const listJson = localStorage.getItem(SWAP_LIST_KEY);
  if (!listJson) return [];

  try {
    return JSON.parse(listJson);
  } catch {
    return [];
  }
}

// Serialization with BigInt support
function serializeSwapState(state: SwapState): string {
  return JSON.stringify(state, (_, value) =>
    typeof value === 'bigint' ? `bigint:${value.toString()}` : value
  );
}

function deserializeSwapState(serialized: string): SwapState {
  return JSON.parse(serialized, (_, value) => {
    if (typeof value === 'string' && value.startsWith('bigint:')) {
      return BigInt(value.slice(7));
    }
    return value;
  });
}

// Phase helpers
export function isTerminalPhase(phase: SwapPhase): boolean {
  return [
    SwapPhase.COMPLETED,
    SwapPhase.REFUNDED,
    SwapPhase.FAILED,
  ].includes(phase);
}

export function canRefund(state: SwapState, currentBlockHeight: number): boolean {
  // Can refund if timelock expired and BTC hasn't been redeemed
  return (
    currentBlockHeight >= state.btcCancelTimelock &&
    state.phase !== SwapPhase.BTC_REDEEMED &&
    state.phase !== SwapPhase.XMR_REDEEMED &&
    state.phase !== SwapPhase.COMPLETED &&
    state.btcLockTxId !== undefined
  );
}

export function getNextAction(state: SwapState): string {
  switch (state.phase) {
    case SwapPhase.SWAP_INITIATED:
      return 'Create and broadcast BTC lock transaction';
    case SwapPhase.BTC_LOCK_TX_CREATED:
      return 'Broadcast BTC lock transaction';
    case SwapPhase.BTC_LOCK_TX_BROADCAST:
      return 'Wait for BTC lock confirmations';
    case SwapPhase.BTC_LOCK_TX_CONFIRMED:
      return 'Wait for ASB to lock XMR';
    case SwapPhase.XMR_LOCK_TX_SEEN:
      return 'Wait for XMR lock confirmations';
    case SwapPhase.XMR_LOCK_TX_CONFIRMED:
      return 'Send encrypted signature to ASB';
    case SwapPhase.ENCRYPTED_SIG_SENT:
      return 'Wait for ASB to redeem BTC (reveals secret)';
    case SwapPhase.BTC_REDEEMED:
      return 'Redeem XMR using revealed secret';
    case SwapPhase.XMR_REDEEMABLE:
      return 'Redeem XMR';
    case SwapPhase.REFUND_TIMELOCK_EXPIRED:
      return 'Refund BTC from HTLC';
    case SwapPhase.COMPLETED:
      return 'Swap completed successfully';
    case SwapPhase.REFUNDED:
      return 'BTC refunded';
    case SwapPhase.FAILED:
      return 'Swap failed - check error details';
    default:
      return 'Unknown state';
  }
}

// Export for debugging
export function exportSwapForDebug(state: SwapState): object {
  return {
    id: state.id,
    phase: state.phase,
    btcAmount: state.btcAmount.toString(),
    xmrAmount: state.xmrAmount.toString(),
    exchangeRate: state.exchangeRate,
    btcLockTxId: state.btcLockTxId,
    xmrLockTxId: state.xmrLockTxId,
    secretRevealed: !!state.secret,
    phaseHistory: state.phaseHistory,
    lastError: state.lastError,
  };
}
