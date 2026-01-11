import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Atomic Swaps - XMR/BTC',
  description: 'Trustless XMR-BTC Atomic Swaps with Samourai Wallet Integration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
