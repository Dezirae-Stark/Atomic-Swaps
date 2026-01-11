/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  // Allow connections from Dojo network
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },

  // Environment variables available to the browser
  env: {
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK || 'mainnet',
    NEXT_PUBLIC_TOR_PROXY: process.env.TOR_PROXY || '',
  },
}

module.exports = nextConfig
