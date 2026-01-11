import { NextRequest, NextResponse } from 'next/server';
import { getActiveSwaps, getSwapById } from '@/lib/p2p/swapExecution';

export const dynamic = 'force-dynamic';

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

    // For now, return a simulated swap initiation
    // In production, this would start the actual swap execution
    const swapId = crypto.randomUUID();

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

// Helper functions
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
