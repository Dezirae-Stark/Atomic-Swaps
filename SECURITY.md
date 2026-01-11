# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow responsible disclosure practices.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please report security issues through one of these channels:

1. **GitHub Security Advisories** (Preferred)
   - Go to the Security tab of this repository
   - Click "Report a vulnerability"
   - Provide detailed information about the issue

2. **Private Disclosure**
   - Contact the maintainers privately
   - Encrypt sensitive details if possible

### What to Include

When reporting a vulnerability, please include:

- **Description**: Clear explanation of the vulnerability
- **Impact**: What could an attacker achieve?
- **Reproduction**: Step-by-step instructions to reproduce
- **Environment**: Version, OS, browser, etc.
- **Mitigation**: Any temporary workarounds (if known)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution Target**: Within 30 days (depending on severity)

### Severity Levels

| Level | Description | Examples |
|-------|-------------|----------|
| Critical | Direct fund loss risk | Private key exposure, HTLC bypass |
| High | Significant security impact | Authentication bypass, swap manipulation |
| Medium | Limited security impact | Information disclosure, DoS vectors |
| Low | Minimal impact | Minor information leaks |

## Security Measures

### Cryptographic Security

- All cryptographic operations use audited libraries (@noble/curves, @scure/*)
- Private keys never leave the client browser
- Mnemonics are encrypted with user password before pairing

### Network Security

- Tor support for anonymous ASB connections
- All P2P communications use noise encryption
- No sensitive data transmitted to external servers

### Application Security

- No server-side storage of wallet data
- All operations performed client-side
- No analytics or tracking

## Best Practices for Users

1. **Protect your pairing code** - It contains your encrypted mnemonic
2. **Use a strong password** - Encrypts your wallet data
3. **Verify addresses** - Always double-check swap addresses
4. **Use Tor** - Enable Tor proxy for enhanced privacy
5. **Keep software updated** - Install security updates promptly

## Known Security Considerations

### Atomic Swap Risks

- **Timelock expiry**: If you don't complete the swap in time, follow refund procedures
- **Provider trust**: Only swap with reputable ASB providers
- **Network fees**: Ensure sufficient fees for timely confirmations

### Browser Security

- This is a web application - browser security is important
- Use a secure, updated browser
- Be cautious of browser extensions that could access page content

## Acknowledgments

We appreciate security researchers who help improve our software. Responsible disclosures will be acknowledged in our release notes (with permission).

## Contact

For non-security bugs and features, please use GitHub Issues.

For security matters only, use the channels described above.
