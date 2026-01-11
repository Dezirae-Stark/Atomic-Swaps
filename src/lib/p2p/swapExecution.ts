// Atomic Swap Execution Service
// Implements the XMR-BTC atomic swap protocol
// Reference: https://github.com/UnstoppableSwap/core

import {
  DiscoveredProvider,
  AsbSwapRequest,
  AsbSwapResponse,
  ASB_PROTOCOL_SWAP,
} from './types';

export type SwapPhase =
  | 'initialized'
  | 'btc_lock_published'
  | 'btc_lock_confirmed'
  | 'xmr_lock_proof_received'
  | 'xmr_locked'
  | 'encrypted_signature_sent'
  | 'btc_redeemed'
  | 'xmr_redeemed'
  | 'cancel_timelock_expired'
  | 'btc_cancelled'
  | 'btc_refunded'
  | 'btc_punished';

export interface SwapState {
  id: string;
  phase: SwapPhase;
  provider: DiscoveredProvider;
  btcAmount: bigint; // satoshis
  xmrAmount: bigint; // piconero
  xmrReceiveAddress: string;
  btcRefundAddress: string;
  btcLockTxId?: string;
  xmrLockTxId?: string;
  btcRedeemTxId?: string;
  cancelTimelock: number;
  punishTimelock: number;
  startTime: Date;
  lastUpdate: Date;
  error?: string;
}

export interface SwapEventListener {
  onPhaseChange: (phase: SwapPhase, state: SwapState) => void;
  onError: (error: Error, state: SwapState) => void;
  onComplete: (state: SwapState) => void;
}

// In-memory swap state storage (in production, use persistent storage)
const activeSwaps: Map<string, SwapState> = new Map();

export class SwapExecution {
  private state: SwapState;
  private listeners: SwapEventListener[] = [];

  constructor(
    provider: DiscoveredProvider,
    btcAmount: bigint,
    xmrAmount: bigint,
    xmrReceiveAddress: string,
    btcRefundAddress: string
  ) {
    this.state = {
      id: crypto.randomUUID(),
      phase: 'initialized',
      provider,
      btcAmount,
      xmrAmount,
      xmrReceiveAddress,
      btcRefundAddress,
      cancelTimelock: 72, // 72 blocks (~12 hours)
      punishTimelock: 144, // 144 blocks (~24 hours)
      startTime: new Date(),
      lastUpdate: new Date(),
    };

    activeSwaps.set(this.state.id, this.state);
  }

  addListener(listener: SwapEventListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: SwapEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private updatePhase(phase: SwapPhase): void {
    this.state.phase = phase;
    this.state.lastUpdate = new Date();
    activeSwaps.set(this.state.id, this.state);

    for (const listener of this.listeners) {
      listener.onPhaseChange(phase, this.state);
    }
  }

  private emitError(error: Error): void {
    this.state.error = error.message;
    this.state.lastUpdate = new Date();
    activeSwaps.set(this.state.id, this.state);

    for (const listener of this.listeners) {
      listener.onError(error, this.state);
    }
  }

  private emitComplete(): void {
    for (const listener of this.listeners) {
      listener.onComplete(this.state);
    }
  }

  // Execute the atomic swap
  async execute(): Promise<SwapState> {
    try {
      // Phase 1: Request swap from ASB
      await this.requestSwap();

      // Phase 2: Publish BTC lock transaction
      await this.publishBtcLock();

      // Phase 3: Wait for XMR lock from ASB
      await this.waitForXmrLock();

      // Phase 4: Send encrypted signature
      await this.sendEncryptedSignature();

      // Phase 5: Wait for BTC redeem (reveals secret)
      await this.waitForBtcRedeem();

      // Phase 6: Redeem XMR using revealed secret
      await this.redeemXmr();

      this.emitComplete();
      return this.state;
    } catch (error) {
      this.emitError(error as Error);
      throw error;
    }
  }

  private async requestSwap(): Promise<void> {
    // In production, this would:
    // 1. Connect to the ASB via libp2p
    // 2. Send a swap request using ASB_PROTOCOL_SWAP
    // 3. Receive the swap parameters (lock addresses, timelocks, etc.)

    // Simulate network delay
    await this.simulateDelay(2000);

    this.updatePhase('initialized');
  }

  private async publishBtcLock(): Promise<void> {
    // In production, this would:
    // 1. Create the BTC lock transaction (HTLC)
    // 2. Sign it using the wallet's swap deposit key
    // 3. Broadcast to the Bitcoin network
    // 4. Wait for confirmations

    await this.simulateDelay(3000);

    this.state.btcLockTxId = this.generateFakeTxId();
    this.updatePhase('btc_lock_published');

    // Wait for confirmations
    await this.simulateDelay(5000);
    this.updatePhase('btc_lock_confirmed');
  }

  private async waitForXmrLock(): Promise<void> {
    // In production, this would:
    // 1. Wait for the ASB to send the XMR lock proof
    // 2. Verify the XMR lock transaction
    // 3. Wait for confirmations on Monero

    await this.simulateDelay(5000);

    this.updatePhase('xmr_lock_proof_received');

    await this.simulateDelay(3000);

    this.state.xmrLockTxId = this.generateFakeXmrTxId();
    this.updatePhase('xmr_locked');
  }

  private async sendEncryptedSignature(): Promise<void> {
    // In production, this would:
    // 1. Generate the encrypted signature for the BTC redeem transaction
    // 2. Send it to the ASB via libp2p

    await this.simulateDelay(2000);

    this.updatePhase('encrypted_signature_sent');
  }

  private async waitForBtcRedeem(): Promise<void> {
    // In production, this would:
    // 1. Monitor the Bitcoin network for the redeem transaction
    // 2. Extract the secret from the redeem transaction
    // The ASB redeems BTC by revealing the secret

    await this.simulateDelay(5000);

    this.state.btcRedeemTxId = this.generateFakeTxId();
    this.updatePhase('btc_redeemed');
  }

  private async redeemXmr(): Promise<void> {
    // In production, this would:
    // 1. Use the revealed secret to claim the XMR
    // 2. Broadcast the XMR claim transaction

    await this.simulateDelay(3000);

    this.updatePhase('xmr_redeemed');
  }

  // Cancel and refund the swap (if possible)
  async cancelAndRefund(): Promise<SwapState> {
    // Can only cancel if cancel timelock has expired
    // In production, this would check the blockchain
    const canCancel = ['btc_lock_published', 'btc_lock_confirmed', 'xmr_lock_proof_received', 'xmr_locked'].includes(this.state.phase);

    if (!canCancel) {
      throw new Error(`Cannot cancel swap in phase: ${this.state.phase}`);
    }

    try {
      // Simulate waiting for timelock
      await this.simulateDelay(2000);
      this.updatePhase('cancel_timelock_expired');

      // Publish cancel transaction
      await this.simulateDelay(2000);
      this.updatePhase('btc_cancelled');

      // Publish refund transaction
      await this.simulateDelay(2000);
      this.updatePhase('btc_refunded');

      return this.state;
    } catch (error) {
      this.emitError(error as Error);
      throw error;
    }
  }

  getState(): SwapState {
    return { ...this.state };
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateFakeTxId(): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private generateFakeXmrTxId(): string {
    // Monero tx IDs are also 64 hex chars
    return this.generateFakeTxId();
  }
}

// Get all active swaps
export function getActiveSwaps(): SwapState[] {
  return Array.from(activeSwaps.values());
}

// Get a specific swap by ID
export function getSwapById(id: string): SwapState | undefined {
  return activeSwaps.get(id);
}

// Resume a swap from persisted state
export function resumeSwap(state: SwapState): SwapExecution {
  const execution = new SwapExecution(
    state.provider,
    state.btcAmount,
    state.xmrAmount,
    state.xmrReceiveAddress,
    state.btcRefundAddress
  );

  // Restore state
  Object.assign(execution['state'], state);
  activeSwaps.set(state.id, execution['state']);

  return execution;
}
