'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error Boundary Caught]:', error)

    // Check if error is due to a stale chunk from a new Vercel deployment
    const msg = error?.message || ''
    const isChunkOrImportError =
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('is not valid JSON') ||
      msg.includes('Unexpected token')

    if (isChunkOrImportError) {
      const lastReload = sessionStorage.getItem('last_chunk_error_reload')
      const now = Date.now()
      // Only auto-reload if we haven't reloaded in the last 15 seconds (prevents loops)
      if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
        sessionStorage.setItem('last_chunk_error_reload', now.toString())
        window.location.reload()
      }
    }
  }, [error])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        padding: '24px',
        width: '100%',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
          padding: '36px 28px',
          background: 'var(--black-card)',
          border: '1px solid var(--black-border)',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(201,168,76,0.1)',
            border: '1px solid rgba(201,168,76,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--gold)',
          }}
        >
          <AlertTriangle size={32} />
        </div>

        <h2
          className="font-cinzel"
          style={{
            fontSize: '20px',
            fontWeight: '700',
            color: 'var(--gold)',
            marginBottom: '8px',
          }}
        >
          Connection Interrupted
        </h2>

        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: '1.6',
            marginBottom: '24px',
          }}
        >
          The page took too long to respond or the connection was briefly interrupted.
          Your data is safe.
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            className="btn btn-gold"
            style={{ padding: '10px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={15} /> Try Again
          </button>

          <button
            onClick={() => window.location.href = '/dashboard/tables'}
            className="btn btn-outline"
            style={{ padding: '10px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <ArrowLeft size={15} /> Go to Tables
          </button>
        </div>
      </div>
    </div>
  )
}
