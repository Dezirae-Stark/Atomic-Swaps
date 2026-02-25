import { NextRequest, NextResponse } from 'next/server';
import { getActiveSwaps, getSwapById, SwapExecution } from '@/lib/p2p/swapExecution';
import {
  DiscoveredProvider,
  AsbQuoteResponse,
  RENDEZVOUS_NAMESPACE,
} from '@/lib/p2p/types';

export const dynamic = 'force-dynamic';

// Bootstrap URL for looking up registered providers
const BOOTSTRAP_URL = process.env.BOOTSTRAP_URL || 'http://127.0.0.1:9001';

// Onion address for the local swap provider (used when bootstrap returns "auto")
const SWAPS_ONION = process.env.SWAPS_ONION || '';

// GET - List all swaps or get specific swap
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const swapId = searchParams.get('id');

  if (swapId) {
    const swap = getSwapById(swapId);
    if (!swap) {
      return NextResponse.json(
        { error: 'Swap not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ swap: formatSwapState(swap) });
  }

  const swaps = getActiveSwaps();
  return NextResponse.json({
    swaps: swaps.map(formatSwapState),
  });
}

// POST - Initiate a new swap
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      providerId,
      btcAmount,
      xmrReceiveAddress,
      btcRefundAddress,
    } = body;

    // Validate required fields
    if (!providerId || !btcAmount || !xmrReceiveAddress || !btcRefundAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate Monero address format
    if (!isValidMoneroAddress(xmrReceiveAddress)) {
      return NextResponse.json(
        { error: 'Invalid Monero address' },
        { status: 400 }
      );
    }

    // Validate Bitcoin address format
    if (!isValidBitcoinAddress(btcRefundAddress)) {
      return NextResponse.json(
        { error: 'Invalid Bitcoin address' },
        { status: 400 }
      );
    }

    // Look up provider from bootstrap to get real rate and limits
    const provider = await fetchProviderById(String(providerId));
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found or offline' },
        { status: 404 }
      );
    }

    // btcAmount is satoshis (number) from the client
    const btcSatoshis = BigInt(Math.round(Number(btcAmount)));
    const priceInPiconeroPerSat = provider.quote?.price ?? BigInt(0);
    const xmrPiconero = priceInPiconeroPerSat > 0n
      ? btcSatoshis * priceInPiconeroPerSat
      : BigInt(0);

    // Create a tracked SwapExecution — constructor registers it in activeSwaps
    const execution = new SwapExecution(
      provider,
      btcSatoshis,
      xmrPiconero,
      xmrReceiveAddress,
      btcRefundAddress,
    );
    const swapId = execution.getState().id;

    // Run swap phases in background; caller polls GET for progress
    execution.execute().catch((err) => {
      console.error(`Swap ${swapId} execution error:`, err);
    });

    return NextResponse.json({
      success: true,
      swapId,
      message: 'Swap initiated. Monitor progress via /api/swap?id=' + swapId,
    });
  } catch (error) {
    console.error('Swap initiation error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate swap' },
      { status: 500 }
    );
  }
}

// ─── Bootstrap lookup ────────────────────────────────────────────────────────

interface BootstrapProvider {
  provider_pubkey: number[];
  onion_address: string;
  swap_config: {
    min_btc_sats: number;
    max_btc_sats: number;
    spread_percentage: number;
    btc_cancel_timelock_blocks: number;
    xmr_confirm_blocks: number;
  };
  rate: {
    xmr_per_btc: number;
    source: string;
    rate_timestamp: number;
  };
  reputation: {
    uptime_percentage: number;
  };
  timestamp: number;
}

async function fetchProviderById(peerId: string): Promise<DiscoveredProvider | null> {
  try {
    const res = await fetch(`${BOOTSTRAP_URL}/v1/swap-providers`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const providers: BootstrapProvider[] = data.providers ?? [];

    const match = providers.find((p) => {
      const hex = Buffer.from(p.provider_pubkey).toString('hex');
      return hex === peerId;
    });
    if (!match) return null;

    // Convert bootstrap rate to piconero-per-satoshi price.
    // xmr_per_btc is the Kraken XMR/BTC ticker: BTC cost for 1 XMR (e.g. 0.005195 BTC/XMR).
    // 1 XMR costs xmr_per_btc * 1e8 satoshis, so:
    //   piconero per satoshi = 1e12 / (xmr_per_btc * 1e8) = 1e4 / xmr_per_btc
    const xmrPerBtc = match.rate?.xmr_per_btc ?? 0;
    const priceInPiconeroPerSat = xmrPerBtc > 0
      ? BigInt(Math.round(1e4 / xmrPerBtc))
      : BigInt(0);

    const quote: AsbQuoteResponse = {
      price: priceInPiconeroPerSat,
      min_quantity: BigInt(match.swap_config.min_btc_sats),
      max_quantity: BigInt(match.swap_config.max_btc_sats),
      xmr_amount: BigInt(0),
    };

    // "auto" means use the configured onion address for this node
    const multiaddr = match.onion_address === 'auto' && SWAPS_ONION
      ? SWAPS_ONION
      : match.onion_address;

    const nowSecs = Math.floor(Date.now() / 1000);
    const isOnline = nowSecs - match.timestamp < 600;

    return {
      peerId,
      multiaddrs: multiaddr ? [multiaddr] : [],
      namespace: RENDEZVOUS_NAMESPACE,
      quote,
      lastSeen: new Date(match.timestamp * 1000),
      isOnline,
    };
  } catch (err) {
    console.error('Bootstrap lookup failed:', err);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSwapState(swap: any) {
  return {
    id: swap.id,
    phase: swap.phase,
    btcAmount: formatBtc(swap.btcAmount),
    xmrAmount: formatXmr(swap.xmrAmount),
    xmrReceiveAddress: swap.xmrReceiveAddress,
    btcRefundAddress: swap.btcRefundAddress,
    btcLockTxId: swap.btcLockTxId,
    xmrLockTxId: swap.xmrLockTxId,
    btcRedeemTxId: swap.btcRedeemTxId,
    startTime: swap.startTime.toISOString(),
    lastUpdate: swap.lastUpdate.toISOString(),
    error: swap.error,
  };
}

function formatBtc(satoshis: bigint): string {
  return (Number(satoshis) / 1e8).toFixed(8);
}

function formatXmr(piconero: bigint): string {
  return (Number(piconero) / 1e12).toFixed(12);
}

function isValidMoneroAddress(address: string): boolean {
  // Standard address: 95 chars starting with 4
  // Integrated address: 106 chars starting with 4
  // Subaddress: 95 chars starting with 8
  if (address.length === 95) {
    return address.startsWith('4') || address.startsWith('8');
  }
  if (address.length === 106) {
    return address.startsWith('4');
  }
  return false;
}

function isValidBitcoinAddress(address: string): boolean {
  const isMainnet = process.env.NEXT_PUBLIC_NETWORK !== 'testnet';
  if (isMainnet) {
    return address.startsWith('bc1q') || address.startsWith('bc1p');
  }
  return address.startsWith('tb1q') || address.startsWith('tb1p');
}
