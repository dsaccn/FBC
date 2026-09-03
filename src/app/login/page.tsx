'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import NexoraLogo from '@/components/NexoraLogo'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Invalid username or password')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0B1120',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background neon glow decoration */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(ellipse at 30% 30%, rgba(0, 240, 255, 0.07) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(0, 230, 153, 0.05) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ width: '100%', maxWidth: '440px', animation: 'fadeIn 0.4s ease', position: 'relative', zIndex: 1 }}>
        {/* Logo Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <NexoraLogo size="lg" showSubtitle={true} className="justify-center" />
        </div>

        {/* Login Card */}
        <div
          className="card shadow-2xl"
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '28px',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#F8FAFC',
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            System Authentication
          </h2>

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#FCA5A5',
                fontSize: '13px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label className="input-label" style={{ color: '#CBD5E1', fontSize: '12px', fontWeight: '500' }}>
                Username / Agent ID
              </label>
              <input
                type="text"
                className="input"
                style={{
                  background: 'rgba(2, 6, 23, 0.6)',
                  borderColor: 'rgba(148, 163, 184, 0.2)',
                  color: '#FFFFFF',
                }}
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label className="input-label" style={{ color: '#CBD5E1', fontSize: '12px', fontWeight: '500' }}>
                Password
              </label>
              <input
                type="password"
                className="input"
                style={{
                  background: 'rgba(2, 6, 23, 0.6)',
                  borderColor: 'rgba(148, 163, 184, 0.2)',
                  color: '#FFFFFF',
                }}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn"
              style={{
                width: '100%',
                fontSize: '15px',
                padding: '12px',
                fontWeight: '600',
                background: 'linear-gradient(135deg, #00E699 0%, #059669 100%)',
                color: '#06281E',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(0, 230, 153, 0.3)',
                border: 'none',
              }}
              disabled={loading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="animate-pulse">●</span> Authenticating...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#64748B', fontSize: '11px', marginTop: '24px', letterSpacing: '0.02em' }}>
          NEXORA TECH · Intercity Transport & Digital Seat Ticketing
        </p>
      </div>
    </main>
  )
}
