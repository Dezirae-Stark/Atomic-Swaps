# Atomic Swaps GUI

**Trustless XMR-BTC Atomic Swaps with Samourai Wallet Integration**

A privacy-focused web interface for performing trustless atomic swaps between Bitcoin (BTC) and Monero (XMR), featuring seamless integration with Samourai Wallet pairing codes.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)

## Overview

Atomic Swaps GUI provides a user-friendly interface for executing trustless cross-chain swaps between Bitcoin and Monero. By leveraging the COMIT/UnstoppableSwap protocol, users can exchange BTC for XMR without relying on centralized exchanges or custodians.

### Key Features

- **Trustless Swaps**: Cryptographic guarantees ensure either both parties receive their funds or the swap is cancelled
- **Samourai Wallet Integration**: Connect using your Samourai Wallet pairing code for seamless key management
- **Privacy-First**: Tor support for connecting to ASB providers, no KYC required
- **Self-Hosted**: Run your own instance alongside your Dojo stack
- **Open Source**: Fully auditable code with no hidden dependencies

## How Atomic Swaps Work

```
┌─────────────────────────────────────────────────────────────────┐
│                    XMR-BTC Atomic Swap Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  User (Bob)                              ASB Provider (Alice)     │
│  ──────────                              ───────────────────      │
│                                                                   │
│  1. Request Quote  ─────────────────────>                         │
│                    <─────────────────────  2. Send Quote          │
│                                                                   │
│  3. Lock BTC in HTLC ───────────────────>                         │
│                    <─────────────────────  4. Lock XMR            │
│                                                                   │
│  5. Watch for XMR lock confirmation                               │
│                                                                   │
│  6. Send encrypted signature ───────────>                         │
│                    <─────────────────────  7. Claim BTC           │
│                                                                   │
│  8. Extract secret from BTC claim                                 │
│  9. Claim XMR with secret                                         │
│                                                                   │
│  ✓ Swap Complete - Trustless exchange achieved                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Security Guarantees

- **Hash Time-Locked Contracts (HTLCs)**: Bitcoin funds are locked with cryptographic conditions
- **Timelock Protection**: If the swap fails, users can refund their BTC after the timelock expires
- **Atomic Execution**: The cryptographic secret required to claim XMR is revealed when the ASB claims BTC

## Installation

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- (Optional) Tor proxy for privacy

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Dezirae-Stark/Atomic-Swaps.git
cd Atomic-Swaps

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:3001`

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build Docker image
docker build -t atomic-swaps-gui .

# Run container
docker run -p 3001:3001 atomic-swaps-gui
```

## Configuration

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Network Configuration
NEXT_PUBLIC_NETWORK=mainnet  # or 'testnet'

# Tor Proxy (optional, for privacy)
TOR_PROXY_URL=socks5h://127.0.0.1:9050

# API Endpoints (optional)
NEXT_PUBLIC_MEMPOOL_API=https://mempool.space/api
```

### Dojo Integration

If running alongside a Dojo stack, add the swaps service to your `docker-compose.yaml`:

```yaml
swaps_gui:
  image: atomic-swaps-gui:latest
  container_name: swaps_gui
  restart: unless-stopped
  ports:
    - "3001:3001"
  environment:
    - NEXT_PUBLIC_NETWORK=mainnet
  networks:
    dojonet:
      ipv4_address: 172.28.1.12
```

## Usage Guide

### Connecting Your Wallet

1. **Generate Pairing Code**: In Samourai Wallet, go to Settings > Transactions > Atomic Swaps > Generate Pairing Code
2. **Paste Code**: Copy the JSON pairing code and paste it into the connection dialog
3. **Enter Password**: Enter your wallet password to decrypt the mnemonic
4. **Optional Passphrase**: If you use a BIP39 passphrase, enter it when prompted

### Performing a Swap

1. **Select Provider**: The application discovers available ASB providers automatically
2. **Enter Amount**: Specify the BTC amount you want to swap (within provider limits)
3. **Provide XMR Address**: Enter your Monero wallet address to receive funds
4. **Review Quote**: Verify the exchange rate and fees
5. **Execute Swap**: Confirm to begin the atomic swap process
6. **Monitor Progress**: Track the swap through each phase until completion

### Swap Phases

| Phase | Description |
|-------|-------------|
| **Quote** | Request and review exchange rate from provider |
| **Lock BTC** | Your Bitcoin is locked in a Hash Time-Locked Contract |
| **Lock XMR** | Provider locks Monero, awaiting your signature |
| **Exchange** | Cryptographic exchange of secrets |
| **Complete** | Funds are released to both parties |

### Cancellation & Refunds

If a swap fails or times out:

- Bitcoin funds can be refunded after the timelock expires (typically 24-48 hours)
- Monero remains with the provider if the swap didn't complete
- No funds are lost - the atomic nature ensures safety

## Architecture

### Project Structure

```
src/
├── app/                    # Next.js app router
│   └── page.tsx           # Main application page
├── components/            # React components
│   ├── SwapInterface.tsx  # Main swap UI
│   ├── WalletConnect.tsx  # Wallet connection
│   ├── ProviderList.tsx   # ASB provider discovery
│   └── SwapHistory.tsx    # Transaction history
├── lib/
│   ├── bitcoin/
│   │   ├── transactions.ts # HTLC creation & signing
│   │   └── swapWallet.ts   # Key derivation
│   ├── p2p/
│   │   ├── node.ts        # libp2p networking
│   │   ├── discovery.ts   # Provider discovery
│   │   └── types.ts       # Protocol types
│   ├── monero/
│   │   └── address.ts     # Address validation
│   └── wallet.ts          # Wallet utilities
├── hooks/
│   ├── useSwapExecutor.ts # Swap execution logic
│   └── useSwapHistory.ts  # History management
└── types/
    └── index.ts           # TypeScript definitions
```

### Key Technologies

- **Next.js 14**: React framework with App Router
- **libp2p**: Peer-to-peer networking for ASB connections
- **@scure/btc-signer**: Bitcoin transaction construction
- **@noble/curves**: Elliptic curve cryptography
- **Framer Motion**: UI animations
- **Tailwind CSS**: Styling

### Derivation Paths

The application uses BIP84 derivation paths compatible with Samourai Wallet:

| Account | Path | Purpose |
|---------|------|---------|
| Deposit | `m/84'/0'/2147483641'/0/0` | Receiving swap deposits |
| Refund | `m/84'/0'/2147483642'/0/0` | Refund address |
| ASB | `m/84'/0'/2147483643'/0/0` | ASB communication keys |

## Security

### Important Security Notes

- **Never share your pairing code** - It contains your encrypted mnemonic
- **Verify provider reputation** - Only swap with trusted ASB providers
- **Keep software updated** - Security patches are released regularly
- **Use Tor** - Enable Tor proxy for enhanced privacy

### Threat Model

This application is designed to protect against:

- Custodial risk (no third party holds your funds)
- Swap fraud (cryptographic guarantees prevent theft)
- Privacy leaks (Tor support, no KYC)

### Reporting Security Issues

Please report security vulnerabilities privately via GitHub Security Advisories or email. Do not create public issues for security bugs.

## API Reference

### Provider Discovery

```typescript
import { ProviderDiscovery } from '@/lib/p2p/discovery';

const discovery = new ProviderDiscovery({ isMainnet: true });
const providers = await discovery.discoverProviders();
```

### Creating a Swap Node

```typescript
import { createSwapNode } from '@/lib/p2p/node';

const node = await createSwapNode({
  isMainnet: true,
  torProxyUrl: 'socks5h://127.0.0.1:9050'
});

await node.start();
const quote = await node.requestQuote(peerId, btcAmount);
```

### Bitcoin Transactions

```typescript
import {
  createHtlcScript,
  createLockTransaction,
  createRefundTransaction
} from '@/lib/bitcoin/transactions';

// Create HTLC for atomic swap
const htlcScript = createHtlcScript({
  secretHash,
  redeemPubkey: alicePubkey,
  refundPubkey: bobPubkey,
  locktime: blockHeight + 144 // ~24 hours
});
```

## Troubleshooting

### Common Issues

**Connection Failed**
- Ensure Tor is running if using `.onion` addresses
- Check firewall settings for libp2p ports

**Invalid Pairing Code**
- Verify the JSON is complete and properly formatted
- Ensure pairing type is `swaps.gui`

**Swap Stuck**
- Wait for blockchain confirmations
- Check transaction status on mempool explorer
- Contact ASB provider if issues persist

### Debug Mode

Enable verbose logging:

```env
DEBUG=libp2p:*,atomic-swaps:*
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone and install
git clone https://github.com/Dezirae-Stark/Atomic-Swaps.git
cd Atomic-Swaps
npm install

# Run in development mode
npm run dev

# Run linter
npm run lint

# Type check
npx tsc --noEmit
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [COMIT Network](https://comit.network/) - Atomic swap protocol research
- [UnstoppableSwap](https://unstoppableswap.net/) - Reference implementation
- [Samourai Wallet](https://samouraiwallet.com/) - Wallet integration
- [libp2p](https://libp2p.io/) - Peer-to-peer networking

## Disclaimer

This software is provided "as is" without warranty of any kind. Atomic swaps involve real cryptocurrency transactions. Always verify amounts and addresses before executing swaps. Use at your own risk.

---

**Built with privacy in mind. No KYC. No custody. Just code.**
