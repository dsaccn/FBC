import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=*, microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' * data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' * blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com *",
      "img-src 'self' data: blob: *",
      "font-src 'self' https://fonts.gstatic.com data: *",
      "connect-src 'self' https://*.neon.tech ws: wss: *",
      "media-src 'self' blob: data: *",
    ].join('; '),
  },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: [
    '*.trycloudflare.com',
    'trycloudflare.com',
    'localhost:3000',
    '127.0.0.1:3000',
  ],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
