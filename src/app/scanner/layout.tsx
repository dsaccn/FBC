import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Kogna Verifier',
  description: 'Telebirr & CBE Payment Verification for Kogna Coffee',
  manifest: '/scanner-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kogna Verifier',
  },
}

export const viewport: Viewport = {
  themeColor: '#B48A1E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="manifest" href="/scanner-manifest.json" />
      <meta name="theme-color" content="#B48A1E" />
      {children}
    </>
  )
}
