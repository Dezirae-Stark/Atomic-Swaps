# Contributing to Atomic Swaps GUI

Thank you for your interest in contributing to Atomic Swaps GUI! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Be kind, constructive, and professional in all interactions.

## How to Contribute

### Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. **Use the bug report template** when creating a new issue
3. **Include reproduction steps** with as much detail as possible
4. **Provide environment information** (OS, Node version, browser)

### Suggesting Features

1. **Check the roadmap** to see if the feature is planned
2. **Open a discussion** before implementing major changes
3. **Describe the use case** and why it would benefit users
4. **Consider privacy implications** - we prioritize user privacy

### Pull Requests

1. **Fork the repository** and create a feature branch
2. **Follow code style** - run `npm run lint` before committing
3. **Write tests** for new functionality when applicable
4. **Update documentation** if your changes affect usage
5. **Keep PRs focused** - one feature or fix per PR

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Getting Started

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/Atomic-Swaps.git
cd Atomic-Swaps

# Install dependencies
npm install

# Start development server
npm run dev
```

### Code Style

- **TypeScript**: Use strict typing, avoid `any`
- **Components**: Functional components with hooks
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Imports**: Group by external, internal, types

```typescript
// External imports
import { useState } from 'react';
import { motion } from 'framer-motion';

// Internal imports
import { SwapWallet } from '@/lib/bitcoin/swapWallet';
import { ProviderDiscovery } from '@/lib/p2p/discovery';

// Types
import type { WalletState, SwapPhase } from '@/types';
```

### Testing

```bash
# Run linter
npm run lint

# Type check
npx tsc --noEmit

# Build to verify
npm run build
```

## Project Structure

```
src/
├── app/          # Next.js pages
├── components/   # React components
├── hooks/        # Custom React hooks
├── lib/          # Core libraries
│   ├── bitcoin/  # Bitcoin transaction logic
│   ├── p2p/      # libp2p networking
│   └── monero/   # Monero utilities
└── types/        # TypeScript definitions
```

## Security Considerations

When contributing, please consider:

- **No logging of sensitive data** (keys, mnemonics, addresses)
- **Input validation** for all user-provided data
- **Secure cryptographic practices** - use established libraries
- **Privacy preservation** - minimize data exposure

### Security Vulnerabilities

If you discover a security vulnerability:

1. **Do NOT create a public issue**
2. Report via GitHub Security Advisories
3. Allow time for a fix before disclosure

## Commit Messages

Follow conventional commit format:

```
type(scope): description

feat(swap): add multi-provider support
fix(wallet): correct derivation path for testnet
docs(readme): update installation instructions
refactor(p2p): simplify connection handling
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Review Process

1. All PRs require at least one approval
2. CI checks must pass (lint, type check, build)
3. Documentation must be updated if needed
4. Breaking changes require discussion first

## Getting Help

- **GitHub Discussions**: For questions and ideas
- **Issues**: For bugs and feature requests
- **Pull Requests**: For code contributions

## Recognition

Contributors will be acknowledged in:
- Release notes for significant contributions
- README acknowledgments section

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for helping make atomic swaps more accessible!
