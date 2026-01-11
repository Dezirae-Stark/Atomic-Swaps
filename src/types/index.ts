export interface WalletState {
  isConnected: boolean;
  network: 'mainnet' | 'testnet';
  fingerprint: string;
  depositAddress: string;
  refundAddress: string;
  asbAddress: string;
  depositXpub: string;
  refundXpub: string;
  asbXpub: string;
}

export interface SwapFormData {
  btcAmount: string;
  xmrAddress: string;
  selectedProvider: string;
}

export type SwapStep =
  | 'connect'
  | 'select_provider'
  | 'enter_details'
  | 'confirm'
  | 'executing'
  | 'completed'
  | 'failed';

export interface SwapProgress {
  step: SwapStep;
  message: string;
  progress: number;
  txIds: {
    btcLock?: string;
    xmrLock?: string;
    btcRedeem?: string;
    xmrRedeem?: string;
  };
}
