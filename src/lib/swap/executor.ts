// Swap Executor - Orchestrates the XMR-BTC atomic swap protocol
// Coordinates between libp2p communication, Bitcoin transactions, and state management

import { hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { createSwapNode, SwapNode, getSwapNode } from '../p2p/node';
import { SwapWallet, SwapKeys } from '../bitcoin/swapWallet';
import {
  createHtlcScript,
  htlcScriptToAddress,
  createLockTransaction,
  createRefundTransaction,
  generateSecret,
  hashSecret,
  MAINNET,
  TESTNET,
  Network,
} from '../bitcoin/transactions';
import {
  isValidMoneroAddress,
  parseMoneroAddress,
} from '../monero/address';
import {
  SwapState,
  SwapPhase,
  createSwapState,
  transitionPhase,
  updateSwapState,
  recordSwapError,
  saveSwapState,
  loadSwapState,
  canRefund,
} from './state';
import {
  AsbSwapRequest,
  AsbSwapResponse,
  AsbQuoteResponse,
} from '../p2p/types';

export interface SwapConfig {
  isMainnet: boolean;
  torProxyUrl?: string;
  btcRpcUrl?: string;
  mempoolUrl?: string;
}

export interface SwapQuote {
  peerId: string;
  btcAmount: bigint;
  xmrAmount: bigint;
  exchangeRate: number;
  maxBtc: bigint;
  minBtc: bigint;
  expiresAt: number;
}

export interface SwapExecutionCallbacks {
  onPhaseChange?: (phase: SwapPhase, state: SwapState) => void;
  onError?: (error: Error, state: SwapState) => void;
  onComplete?: (state: SwapState) => void;
  onTransactionBroadcast?: (txType: 'lock' | 'refund' | 'redeem', txId: string) => void;
}

export class SwapExecutor {
  private node: SwapNode | null = null;
  private wallet: SwapWallet;
  private config: SwapConfig;
  private network: Network;
  private callbacks: SwapExecutionCallbacks;

  constructor(
    wallet: SwapWallet,
    config: SwapConfig,
    callbacks: SwapExecutionCallbacks = {}
  ) {
    this.wallet = wallet;
    this.config = config;
    this.network = config.isMainnet ? MAINNET : TESTNET;
    this.callbacks = callbacks;
  }

  // Initialize the p2p node
  async initialize(): Promise<void> {
    this.node = await createSwapNode({
      isMainnet: this.config.isMainnet,
      torProxyUrl: this.config.torProxyUrl,
    });
    await this.node.start();
  }

  // Shutdown the executor
  async shutdown(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.node = null;
    }
  }

  // Request a quote from an ASB provider
  async requestQuote(peerId: string, peerMultiaddr: string, btcAmount: bigint): Promise<SwapQuote> {
    if (!this.node) {
      throw new Error('Executor not initialized');
    }

    // Connect to peer
    await this.node.connectToPeer(peerMultiaddr);

    // Request quote
    const response = await this.node.requestQuote(peerId, btcAmount);

    return {
      peerId,
      btcAmount,
      xmrAmount: response.xmr_amount,
      exchangeRate: Number(response.xmr_amount) / Number(btcAmount),
      maxBtc: response.max_quantity,
      minBtc: response.min_quantity,
      expiresAt: Date.now() + 300000, // 5 minute expiry
    };
  }

  // Execute a swap
  async executeSwap(
    quote: SwapQuote,
    xmrDestinationAddress: string,
    utxos: Array<{ txid: string; vout: number; value: bigint; script: Uint8Array }>
  ): Promise<SwapState> {
    if (!this.node) {
      throw new Error('Executor not initialized');
    }

    // Validate XMR address
    const expectedNetwork = this.config.isMainnet ? 'mainnet' : 'testnet';
    if (!isValidMoneroAddress(xmrDestinationAddress, expectedNetwork)) {
      throw new Error('Invalid Monero destination address');
    }

    // Generate secret for the HTLC
    const secret = generateSecret();
    const secretHash = hashSecret(secret);

    // Get keys from wallet
    const keys = this.wallet.getNextDepositKeys();

    // Initiate swap with ASB
    const swapRequest: AsbSwapRequest = {
      btc_amount: quote.btcAmount,
      xmr_address: xmrDestinationAddress,
      btc_refund_pubkey: keys.refundPublicKey,
      secret_hash: secretHash,
    };

    const swapResponse = await this.node.initiateSwap(quote.peerId, swapRequest);

    // Create initial swap state
    let state = createSwapState({
      peerId: quote.peerId,
      btcAmount: quote.btcAmount,
      xmrAmount: quote.xmrAmount,
      exchangeRate: quote.exchangeRate,
      userBtcDepositPubkey: keys.depositPublicKey,
      userBtcRefundPubkey: keys.refundPublicKey,
      asbBtcRedeemPubkey: swapResponse.asb_btc_redeem_pubkey,
      userXmrAddress: xmrDestinationAddress,
      secretHash,
      btcCancelTimelock: swapResponse.cancel_timelock,
      btcPunishTimelock: swapResponse.punish_timelock,
      minBtcLockConfirmations: swapResponse.min_btc_lock_confirmations,
      minXmrLockConfirmations: swapResponse.min_xmr_lock_confirmations,
      network: this.config.isMainnet ? 'mainnet' : 'testnet',
    });

    // Store secret securely (only locally)
    state = updateSwapState(state, { secret: hex.encode(secret) });
    saveSwapState(state);
    this.notifyPhaseChange(state);

    // Create HTLC
    const htlcScript = createHtlcScript({
      secretHash,
      redeemPubkey: swapResponse.asb_btc_redeem_pubkey,
      refundPubkey: keys.refundPublicKey,
      locktime: swapResponse.cancel_timelock,
    });

    const htlcAddress = htlcScriptToAddress(htlcScript, this.network);

    state = updateSwapState(state, {
      htlcScript: hex.encode(htlcScript),
    });

    // Create lock transaction
    const lockTx = createLockTransaction({
      inputs: utxos,
      htlcScript,
      amount: quote.btcAmount,
      changeAddress: keys.depositAddress,
      feeRate: 10, // TODO: Get dynamic fee rate
      network: this.network,
    });

    state = transitionPhase(state, SwapPhase.BTC_LOCK_TX_CREATED);
    state = updateSwapState(state, {
      btcLockTxHex: hex.encode(lockTx.extract()),
    });
    saveSwapState(state);
    this.notifyPhaseChange(state);

    // Broadcast lock transaction
    try {
      const txId = await this.broadcastTransaction(hex.encode(lockTx.extract()));
      state = transitionPhase(state, SwapPhase.BTC_LOCK_TX_BROADCAST);
      state = updateSwapState(state, {
        btcLockTxId: txId,
        btcLockTxVout: 0, // HTLC is first output
      });
      saveSwapState(state);
      this.notifyPhaseChange(state);
      this.callbacks.onTransactionBroadcast?.('lock', txId);
    } catch (error) {
      state = recordSwapError(state, `Failed to broadcast lock tx: ${error}`);
      saveSwapState(state);
      throw error;
    }

    // Continue swap execution asynchronously
    this.continueSwapExecution(state, keys, secret).catch(error => {
      console.error('Swap execution error:', error);
      this.callbacks.onError?.(error, state);
    });

    return state;
  }

  // Continue swap execution after lock tx is broadcast
  private async continueSwapExecution(
    state: SwapState,
    keys: SwapKeys,
    secret: Uint8Array
  ): Promise<void> {
    // Wait for lock tx confirmations
    state = await this.waitForBtcConfirmations(state);

    // Wait for XMR lock from ASB
    state = await this.waitForXmrLock(state);

    // Send encrypted signature
    state = await this.sendEncryptedSignature(state, keys);

    // Wait for ASB to redeem BTC (reveals secret)
    state = await this.waitForBtcRedeem(state);

    // If ASB redeemed, we're done - XMR is now claimable
    // The actual XMR redemption happens on the Monero side using the revealed secret
    state = transitionPhase(state, SwapPhase.COMPLETED);
    saveSwapState(state);
    this.notifyPhaseChange(state);
    this.callbacks.onComplete?.(state);
  }

  // Wait for BTC lock transaction confirmations
  private async waitForBtcConfirmations(state: SwapState): Promise<SwapState> {
    if (!state.btcLockTxId) {
      throw new Error('No lock tx ID');
    }

    const requiredConfirmations = state.minBtcLockConfirmations;
    let confirmations = 0;

    while (confirmations < requiredConfirmations) {
      const txInfo = await this.getTransactionInfo(state.btcLockTxId);
      confirmations = txInfo.confirmations;

      if (confirmations >= requiredConfirmations) {
        state = transitionPhase(
          state,
          SwapPhase.BTC_LOCK_TX_CONFIRMED,
          `${confirmations} confirmations`
        );
        saveSwapState(state);
        this.notifyPhaseChange(state);
        break;
      }

      // Wait before checking again
      await this.sleep(30000); // 30 seconds
    }

    return state;
  }

  // Wait for XMR lock from ASB
  private async waitForXmrLock(state: SwapState): Promise<SwapState> {
    if (!this.node) throw new Error('Node not initialized');

    // Wait for transfer proof from ASB
    const proof = await this.node.waitForTransferProof(state.peerId, state.id);

    // Verify proof and extract XMR lock tx info
    // In production, this would verify the Monero transaction
    state = transitionPhase(state, SwapPhase.XMR_LOCK_TX_SEEN);
    saveSwapState(state);
    this.notifyPhaseChange(state);

    // Wait for XMR confirmations
    // This is simplified - in production, we'd monitor the Monero chain
    const requiredConfirmations = state.minXmrLockConfirmations;

    // Simulate waiting for confirmations
    await this.sleep(requiredConfirmations * 120000); // ~2 min per XMR block

    state = transitionPhase(
      state,
      SwapPhase.XMR_LOCK_TX_CONFIRMED,
      `${requiredConfirmations} XMR confirmations`
    );
    saveSwapState(state);
    this.notifyPhaseChange(state);

    return state;
  }

  // Send encrypted signature to ASB
  private async sendEncryptedSignature(
    state: SwapState,
    keys: SwapKeys
  ): Promise<SwapState> {
    if (!this.node) throw new Error('Node not initialized');

    // Create encrypted signature
    // This is a simplified version - real implementation uses adaptor signatures
    const signature = await this.createEncryptedSignature(state, keys);

    // Send to ASB
    await this.node.sendEncryptedSignature(
      state.peerId,
      state.id,
      signature
    );

    state = transitionPhase(state, SwapPhase.ENCRYPTED_SIG_SENT);
    state = updateSwapState(state, {
      encryptedSignature: hex.encode(signature),
    });
    saveSwapState(state);
    this.notifyPhaseChange(state);

    return state;
  }

  // Create encrypted signature (adaptor signature)
  private async createEncryptedSignature(
    state: SwapState,
    keys: SwapKeys
  ): Promise<Uint8Array> {
    // This is a placeholder for adaptor signature creation
    // In production, this would use ECDSA adaptor signatures
    // The signature is encrypted with the secret, so when ASB decrypts
    // it to redeem BTC, the secret is revealed to us

    const message = new TextEncoder().encode(
      `swap:${state.id}:${state.btcLockTxId}`
    );
    const messageHash = sha256(message);

    // Simplified signature (in production, use proper adaptor signatures)
    return new Uint8Array([...messageHash, ...keys.refundPublicKey.slice(0, 32)]);
  }

  // Wait for ASB to redeem BTC
  private async waitForBtcRedeem(state: SwapState): Promise<SwapState> {
    if (!state.btcLockTxId) throw new Error('No lock tx ID');

    // Monitor the HTLC for redemption
    // When ASB redeems, the secret is revealed in the transaction
    const maxWaitTime = Date.now() + 3600000; // 1 hour max wait

    while (Date.now() < maxWaitTime) {
      const spendingTx = await this.findSpendingTransaction(state.btcLockTxId, 0);

      if (spendingTx) {
        // Extract secret from spending transaction witness
        const revealedSecret = this.extractSecretFromWitness(spendingTx);

        if (revealedSecret) {
          state = transitionPhase(state, SwapPhase.BTC_REDEEMED);
          state = updateSwapState(state, {
            btcRedeemTxId: spendingTx.txid,
            secret: hex.encode(revealedSecret),
          });
          saveSwapState(state);
          this.notifyPhaseChange(state);

          // Mark XMR as redeemable
          state = transitionPhase(
            state,
            SwapPhase.XMR_REDEEMABLE,
            'Secret revealed - XMR can be claimed'
          );
          saveSwapState(state);
          this.notifyPhaseChange(state);

          return state;
        }
      }

      await this.sleep(30000); // Check every 30 seconds
    }

    throw new Error('Timeout waiting for BTC redemption');
  }

  // Refund BTC if swap fails and timelock expires
  async refundSwap(swapId: string): Promise<string> {
    const state = loadSwapState(swapId);
    if (!state) throw new Error('Swap not found');

    const currentHeight = await this.getCurrentBlockHeight();
    if (!canRefund(state, currentHeight)) {
      throw new Error('Cannot refund: timelock not expired or swap already completed');
    }

    if (!state.btcLockTxId || !state.htlcScript) {
      throw new Error('Missing lock transaction data');
    }

    const keys = this.wallet.getKeysAtIndex(
      0, // TODO: Store and retrieve actual indices
      0
    );

    const refundTxHex = this.wallet.signRefundTransaction(
      state.btcLockTxId,
      state.btcLockTxVout!,
      state.btcAmount,
      hex.decode(state.htlcScript),
      keys.refundPrivateKey,
      keys.refundAddress,
      state.btcCancelTimelock,
      10 // fee rate
    );

    const txId = await this.broadcastTransaction(refundTxHex);

    let updatedState = transitionPhase(state, SwapPhase.BTC_REFUNDED);
    updatedState = updateSwapState(updatedState, { btcRefundTxId: txId });
    updatedState = transitionPhase(updatedState, SwapPhase.REFUNDED);
    saveSwapState(updatedState);

    this.callbacks.onTransactionBroadcast?.('refund', txId);
    this.notifyPhaseChange(updatedState);

    return txId;
  }

  // Resume an interrupted swap
  async resumeSwap(swapId: string): Promise<SwapState> {
    const state = loadSwapState(swapId);
    if (!state) throw new Error('Swap not found');

    // Determine what phase we're in and continue from there
    switch (state.phase) {
      case SwapPhase.BTC_LOCK_TX_CREATED:
        // Need to broadcast lock tx
        if (state.btcLockTxHex) {
          const txId = await this.broadcastTransaction(state.btcLockTxHex);
          return updateSwapState(state, { btcLockTxId: txId });
        }
        break;

      case SwapPhase.BTC_LOCK_TX_BROADCAST:
      case SwapPhase.BTC_LOCK_TX_CONFIRMED:
      case SwapPhase.XMR_LOCK_TX_SEEN:
      case SwapPhase.XMR_LOCK_TX_CONFIRMED:
      case SwapPhase.ENCRYPTED_SIG_SENT:
        // Continue monitoring
        // In production, restart the async monitoring process
        break;

      case SwapPhase.REFUND_TIMELOCK_EXPIRED:
        // Can attempt refund
        await this.refundSwap(swapId);
        break;

      default:
        // Already in terminal state
        break;
    }

    return loadSwapState(swapId) || state;
  }

  // Helper methods
  private notifyPhaseChange(state: SwapState): void {
    this.callbacks.onPhaseChange?.(state.phase, state);
  }

  private async broadcastTransaction(txHex: string): Promise<string> {
    const url = this.config.mempoolUrl ||
      (this.config.isMainnet ? 'https://mempool.space/api' : 'https://mempool.space/testnet/api');

    const response = await fetch(`${url}/tx`, {
      method: 'POST',
      body: txHex,
    });

    if (!response.ok) {
      throw new Error(`Broadcast failed: ${await response.text()}`);
    }

    return await response.text();
  }

  private async getTransactionInfo(txId: string): Promise<{ confirmations: number }> {
    const url = this.config.mempoolUrl ||
      (this.config.isMainnet ? 'https://mempool.space/api' : 'https://mempool.space/testnet/api');

    const response = await fetch(`${url}/tx/${txId}`);
    if (!response.ok) {
      return { confirmations: 0 };
    }

    const data = await response.json();
    if (!data.status?.confirmed) {
      return { confirmations: 0 };
    }

    const tipHeight = await this.getCurrentBlockHeight();
    return { confirmations: tipHeight - data.status.block_height + 1 };
  }

  private async getCurrentBlockHeight(): Promise<number> {
    const url = this.config.mempoolUrl ||
      (this.config.isMainnet ? 'https://mempool.space/api' : 'https://mempool.space/testnet/api');

    const response = await fetch(`${url}/blocks/tip/height`);
    return parseInt(await response.text());
  }

  private async findSpendingTransaction(
    txId: string,
    vout: number
  ): Promise<{ txid: string; witness: string[] } | null> {
    const url = this.config.mempoolUrl ||
      (this.config.isMainnet ? 'https://mempool.space/api' : 'https://mempool.space/testnet/api');

    const response = await fetch(`${url}/tx/${txId}/outspends`);
    if (!response.ok) return null;

    const outspends = await response.json();
    const spend = outspends[vout];

    if (!spend?.spent) return null;

    // Fetch the spending transaction to get witness data
    const spendTxResponse = await fetch(`${url}/tx/${spend.txid}`);
    if (!spendTxResponse.ok) return null;

    const spendTx = await spendTxResponse.json();
    const input = spendTx.vin.find((v: any) => v.txid === txId && v.vout === vout);

    return {
      txid: spend.txid,
      witness: input?.witness || [],
    };
  }

  private extractSecretFromWitness(spendTx: { witness: string[] }): Uint8Array | null {
    // The secret is the second witness element in the redeem path
    // Witness: <signature> <secret> <1> <htlc_script>
    if (spendTx.witness.length >= 2) {
      const potentialSecret = hex.decode(spendTx.witness[1]);
      if (potentialSecret.length === 32) {
        return potentialSecret;
      }
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Factory function
export function createSwapExecutor(
  wallet: SwapWallet,
  config: SwapConfig,
  callbacks?: SwapExecutionCallbacks
): SwapExecutor {
  return new SwapExecutor(wallet, config, callbacks);
}
