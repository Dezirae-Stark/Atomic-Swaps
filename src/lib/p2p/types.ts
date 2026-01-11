// UnstoppableSwap ASB Protocol Types
// Reference: https://github.com/UnstoppableSwap/core/blob/master/swap/src/protocol/

export interface AsbQuoteRequest {
  btc_amount: bigint; // satoshis
}

export interface AsbQuoteResponse {
  price: bigint; // piconero per satoshi
  min_quantity: bigint; // min satoshis
  max_quantity: bigint; // max satoshis
  xmr_amount: bigint; // calculated XMR amount in piconero
}

export interface AsbSwapRequest {
  btc_amount: bigint;
  xmr_address: string; // User's XMR destination address
  btc_refund_pubkey: Uint8Array; // User's BTC refund public key
  secret_hash: Uint8Array; // SHA256 hash of the secret
}

export interface AsbSwapResponse {
  swap_id: string;
  asb_btc_redeem_pubkey: Uint8Array; // ASB's BTC redeem public key
  cancel_timelock: number; // Block height for refund
  punish_timelock: number; // Block height for punishment
  min_btc_lock_confirmations: number;
  min_xmr_lock_confirmations: number;
  xmr_lock_address?: string; // Where ASB will lock XMR
}

export interface DiscoveredProvider {
  peerId: string;
  multiaddrs: string[];
  namespace: string;
  quote?: AsbQuoteResponse;
  lastSeen: Date;
  isOnline: boolean;
}

// Rendezvous protocol namespace for XMR-BTC swaps
export const RENDEZVOUS_NAMESPACE = '/xmr-btc-swap/0.1.0/discover';

// ASB protocol IDs
export const ASB_PROTOCOL_QUOTE = '/xmr-btc-swap/0.1.0/quote';
export const ASB_PROTOCOL_SWAP = '/xmr-btc-swap/0.1.0/swap';
export const ASB_PROTOCOL_TRANSFER_PROOF = '/xmr-btc-swap/0.1.0/transfer-proof';
export const ASB_PROTOCOL_ENCRYPTED_SIGNATURE = '/xmr-btc-swap/0.1.0/encrypted-signature';

// Known mainnet rendezvous points
export const MAINNET_RENDEZVOUS_POINTS = [
  '/dns4/discover.unstoppableswap.net/tcp/8888/p2p/12D3KooWA6cnqJpVnreBVnoro8midDL9Lpzmg8oJPoAGi7YYaamE',
  '/dns4/eratosthen.es/tcp/7798/p2p/12D3KooWAh7EXXa2ZyegzLGdjvj1W4G3EXrTGrf6trraoT1tF45i',
];

// Known testnet rendezvous points
export const TESTNET_RENDEZVOUS_POINTS = [
  '/dns4/discover.unstoppableswap.net/tcp/8889/p2p/12D3KooWA6cnqJpVnreBVnoro8midDL9Lpzmg8oJPoAGi7YYaamE',
];
