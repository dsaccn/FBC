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
    if (!username.trim() || !password) {
      setError('Please enter both username and password')
      setLoading(false)
      return
    }

    try {
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
    } catch {
      setError('Network connection error. Please try again.')
      setLoading(false)
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
            'radial-gradient(ellipse at 25% 25%, rgba(0, 229, 255, 0.06) 0%, transparent 55%), radial-gradient(ellipse at 75% 75%, rgba(0, 229, 255, 0.04) 0%, transparent 55%)',
          pointerEvents: 'none',
        }}
      />

      {/* Animated grid lines (subtle) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(0, 229, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.02) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
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
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0, 229, 255, 0.12)',
            borderRadius: '16px',
            padding: '32px 28px',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#E2E8F0',
              marginBottom: '20px',
              textAlign: 'center',
              letterSpacing: '0.02em',
            }}
          >
            System Authentication
          </h2>

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
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
              <label className="input-label" style={{ color: '#94A3B8', fontSize: '12px', fontWeight: '500' }}>
                Username / Agent ID
              </label>
              <input
                type="text"
                className="input"
                style={{
                  background: 'rgba(2, 6, 23, 0.6)',
                  borderColor: 'rgba(0, 229, 255, 0.15)',
                  color: '#F0F4F8',
                }}
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label className="input-label" style={{ color: '#94A3B8', fontSize: '12px', fontWeight: '500' }}>
                Password
              </label>
              <input
                type="password"
                className="input"
                style={{
                  background: 'rgba(2, 6, 23, 0.6)',
                  borderColor: 'rgba(0, 229, 255, 0.15)',
                  color: '#F0F4F8',
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
                padding: '13px',
                fontWeight: '600',
                background: 'linear-gradient(135deg, #00E5FF 0%, #0097A7 100%)',
                color: '#0B1120',
                borderRadius: '10px',
                boxShadow: '0 4px 18px rgba(0, 229, 255, 0.25)',
                border: 'none',
                letterSpacing: '0.02em',
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

        <p style={{ textAlign: 'center', color: '#4A5568', fontSize: '11px', marginTop: '24px', letterSpacing: '0.03em' }}>
          MEBA TECH PRO · POS &amp; Management System
        </p>
      </div>
    </main>
  )
}
