import { NextResponse } from 'next/server';
import { getProviderDiscovery, ProviderDiscovery } from '@/lib/p2p/discovery';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isMainnet = process.env.NEXT_PUBLIC_NETWORK !== 'testnet';
    const torProxy = process.env.TOR_PROXY;

    const discovery = getProviderDiscovery({
      isMainnet,
      torProxy,
    });

    const providers = await discovery.discoverProviders();

    // Transform providers for the frontend
    const formattedProviders = providers.map(provider => ({
      peerId: provider.peerId,
      multiaddr: provider.multiaddrs[0] || '',
      testnet: !isMainnet,
      minBtc: provider.quote
        ? ProviderDiscovery.formatBtcAmount(provider.quote.min_quantity)
        : '0.0001',
      maxBtc: provider.quote
        ? ProviderDiscovery.formatBtcAmount(provider.quote.max_quantity)
        : '0.1',
      price: provider.quote
        ? ProviderDiscovery.formatPrice(provider.quote.price)
        : '0.00625',
      uptime: 99.0, // TODO: Track actual uptime
      age: 'Unknown',
      isOnline: provider.isOnline,
      lastSeen: provider.lastSeen.toISOString(),
    }));

    return NextResponse.json({
      providers: formattedProviders,
      network: isMainnet ? 'mainnet' : 'testnet',
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Provider discovery error:', error);
    return NextResponse.json(
      { error: 'Failed to discover providers' },
      { status: 500 }
    );
  }
}
