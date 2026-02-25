// libp2p Provider Discovery Service
// Connects to UnstoppableSwap rendezvous network to discover ASB providers

import {
  DiscoveredProvider,
  AsbQuoteResponse,
  MAINNET_RENDEZVOUS_POINTS,
  TESTNET_RENDEZVOUS_POINTS,
  RENDEZVOUS_NAMESPACE,
  ASB_PROTOCOL_QUOTE,
} from './types';

// Local OB bootstrap node — primary discovery source
const BOOTSTRAP_URL = process.env.BOOTSTRAP_URL || 'http://127.0.0.1:9001';
const SWAPS_ONION = process.env.SWAPS_ONION || '';

// Provider cache with TTL
interface ProviderCache {
  providers: DiscoveredProvider[];
  lastUpdated: Date;
  ttlMs: number;
}

let providerCache: ProviderCache = {
  providers: [],
  lastUpdated: new Date(0),
  ttlMs: 5 * 60 * 1000, // 5 minutes
};

// Known fallback providers when discovery fails
const FALLBACK_PROVIDERS: DiscoveredProvider[] = [
  {
    peerId: '12D3KooWCdMKjesXMJz1SiZ7HgotrxuqhQJbP5sgBm2BwP1cqThi',
    multiaddrs: ['/onion3/wyqduqymx6dwde3kk5l4l2zyv4wbdoximjdp6vlb5gvzquyqhxqccqyd:9939'],
    namespace: RENDEZVOUS_NAMESPACE,
    quote: {
      price: BigInt(625000000000), // ~0.00625 BTC per XMR (160 XMR per BTC)
      min_quantity: BigInt(10000), // 0.0001 BTC
      max_quantity: BigInt(10000000), // 0.1 BTC
      xmr_amount: BigInt(0), // Calculated at request time
    },
    lastSeen: new Date(),
    isOnline: true,
  },
  {
    peerId: '12D3KooWA6cnqJpVnreBVnoro8midDL9Lpzmg8oJPoAGi7YYaamE',
    multiaddrs: ['/dns4/discover.unstoppableswap.net/tcp/8888'],
    namespace: RENDEZVOUS_NAMESPACE,
    quote: {
      price: BigInt(610000000000), // ~0.0061 BTC per XMR (164 XMR per BTC)
      min_quantity: BigInt(100000), // 0.001 BTC
      max_quantity: BigInt(50000000), // 0.5 BTC
      xmr_amount: BigInt(0), // Calculated at request time
    },
    lastSeen: new Date(),
    isOnline: true,
  },
];

export interface DiscoveryOptions {
  isMainnet: boolean;
  torProxy?: string;
  timeout?: number;
}

export class ProviderDiscovery {
  private isMainnet: boolean;
  private torProxy?: string;
  private timeout: number;

  constructor(options: DiscoveryOptions) {
    this.isMainnet = options.isMainnet;
    this.torProxy = options.torProxy;
    this.timeout = options.timeout || 30000;
  }

  // Get rendezvous points for the network
  getRendezvousPoints(): string[] {
    return this.isMainnet ? MAINNET_RENDEZVOUS_POINTS : TESTNET_RENDEZVOUS_POINTS;
  }

  // Discover providers from rendezvous network
  async discoverProviders(): Promise<DiscoveredProvider[]> {
    // Check cache first
    if (this.isCacheValid()) {
      return providerCache.providers;
    }

    try {
      // In production, this would use libp2p to connect to rendezvous points
      // and discover registered ASB providers using the rendezvous protocol
      //
      // The flow is:
      // 1. Connect to a rendezvous point
      // 2. Query for peers registered under RENDEZVOUS_NAMESPACE
      // 3. For each discovered peer, connect and request a quote
      // 4. Return the list of providers with their quotes

      const providers = await this.fetchProvidersFromRendezvous();

      // Update cache
      providerCache = {
        providers,
        lastUpdated: new Date(),
        ttlMs: 5 * 60 * 1000,
      };

      return providers;
    } catch (error) {
      console.error('Provider discovery failed:', error);
      // Return fallback providers
      return FALLBACK_PROVIDERS;
    }
  }

  // Fetch providers from the local OB bootstrap node
  private async fetchProvidersFromRendezvous(): Promise<DiscoveredProvider[]> {
    try {
      const res = await fetch(`${BOOTSTRAP_URL}/v1/swap-providers`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Bootstrap returned ${res.status}`);

      const data = await res.json();
      const raw: any[] = data.providers ?? [];
      if (raw.length === 0) return FALLBACK_PROVIDERS;

      const nowSecs = Math.floor(Date.now() / 1000);

      return raw.map((p): DiscoveredProvider => {
        const peerId = Buffer.from(p.provider_pubkey as number[]).toString('hex');
        const xmrPerBtc: number = p.rate?.xmr_per_btc ?? 0;
        // xmr_per_btc is the Kraken XMR/BTC ticker (BTC cost per XMR, e.g. 0.005195).
        // piconero per satoshi = 1e12 / (xmr_per_btc * 1e8) = 1e4 / xmr_per_btc
        const priceInPiconeroPerSat = xmrPerBtc > 0
          ? BigInt(Math.round(1e4 / xmrPerBtc))
          : BigInt(0);

        const quote: AsbQuoteResponse = {
          price: priceInPiconeroPerSat,
          min_quantity: BigInt(p.swap_config?.min_btc_sats ?? 0),
          max_quantity: BigInt(p.swap_config?.max_btc_sats ?? 0),
          xmr_amount: BigInt(0),
        };

        const onion: string = p.onion_address;
        const multiaddr = onion === 'auto' && SWAPS_ONION ? SWAPS_ONION : onion;

        return {
          peerId,
          multiaddrs: multiaddr && multiaddr !== 'auto' ? [multiaddr] : [],
          namespace: RENDEZVOUS_NAMESPACE,
          quote,
          lastSeen: new Date((p.timestamp as number) * 1000),
          isOnline: nowSecs - (p.timestamp as number) < 600,
        };
      });
    } catch (err) {
      console.warn('Bootstrap discovery failed, using fallback:', err);
      return FALLBACK_PROVIDERS;
    }
  }

  // Get a quote from a specific provider
  async getQuote(provider: DiscoveredProvider, btcAmount: bigint): Promise<AsbQuoteResponse | null> {
    try {
      // In production, this would connect to the ASB and request a quote
      // using the ASB_PROTOCOL_QUOTE protocol ID

      if (!provider.quote) {
        return null;
      }

      // Validate amount against provider limits
      if (btcAmount < provider.quote.min_quantity) {
        throw new Error(`Amount below minimum: ${provider.quote.min_quantity} satoshis`);
      }
      if (btcAmount > provider.quote.max_quantity) {
        throw new Error(`Amount above maximum: ${provider.quote.max_quantity} satoshis`);
      }

      return provider.quote;
    } catch (error) {
      console.error('Failed to get quote:', error);
      return null;
    }
  }

  // Check if provider cache is still valid
  private isCacheValid(): boolean {
    const now = Date.now();
    const cacheAge = now - providerCache.lastUpdated.getTime();
    return cacheAge < providerCache.ttlMs && providerCache.providers.length > 0;
  }

  // Format price for display (piconero per satoshi -> BTC per XMR)
  static formatPrice(priceInPiconeroPerSat: bigint): string {
    // Convert piconero/sat to BTC/XMR
    // 1 BTC = 100,000,000 satoshi
    // 1 XMR = 1,000,000,000,000 piconero
    const btcPerXmr = Number(priceInPiconeroPerSat) / 1e12 * 1e8;
    return btcPerXmr.toFixed(8);
  }

  // Format amount limits for display
  static formatBtcAmount(satoshis: bigint): string {
    return (Number(satoshis) / 1e8).toFixed(8);
  }

  // Calculate XMR amount for given BTC amount and price
  static calculateXmrAmount(btcSatoshis: bigint, priceInPiconeroPerSat: bigint): bigint {
    // XMR (piconero) = BTC (satoshi) * price (piconero/sat)
    return btcSatoshis * priceInPiconeroPerSat;
  }

  // Format XMR amount for display
  static formatXmrAmount(piconero: bigint): string {
    return (Number(piconero) / 1e12).toFixed(12);
  }
}

// Singleton instance
let discoveryInstance: ProviderDiscovery | null = null;

export function getProviderDiscovery(options?: DiscoveryOptions): ProviderDiscovery {
  if (!discoveryInstance) {
    discoveryInstance = new ProviderDiscovery(options || { isMainnet: true });
  }
  return discoveryInstance;
}

export function resetProviderDiscovery(): void {
  discoveryInstance = null;
  providerCache = {
    providers: [],
    lastUpdated: new Date(0),
    ttlMs: 5 * 60 * 1000,
  };
}
