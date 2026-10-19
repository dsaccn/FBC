'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error]:', error)

    const msg = error?.message || ''
    const isChunkOrImportError =
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('is not valid JSON') ||
      msg.includes('Unexpected token')

    if (isChunkOrImportError) {
      const lastReload = sessionStorage.getItem('last_global_error_reload')
      const now = Date.now()
      if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
        sessionStorage.setItem('last_global_error_reload', now.toString())
        window.location.reload()
      }
    }
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: '#0D0905',
          color: '#F5F0E6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            width: '90%',
            textAlign: 'center',
            padding: '36px 24px',
            background: '#1A1408',
            border: '1px solid rgba(201, 168, 76, 0.25)',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(201,168,76,0.1)',
              border: '1px solid rgba(201,168,76,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '26px',
            }}
          >
            ☕
          </div>

          <h1
            style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#C9A84C',
              margin: '0 0 10px',
            }}
          >
            Kogna Coffee POS
          </h1>

          <p
            style={{
              fontSize: '14px',
              color: '#BFB49A',
              lineHeight: '1.6',
              margin: '0 0 24px',
            }}
          >
            The page could not be loaded due to a temporary network pause. Please reload to resume.
          </p>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 22px',
                background: '#C9A84C',
                color: '#0D0905',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/dashboard/tables'}
              style={{
                padding: '10px 22px',
                background: 'transparent',
                color: '#BFB49A',
                border: '1px solid rgba(201, 168, 76, 0.3)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Go to Tables
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
