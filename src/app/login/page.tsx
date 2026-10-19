'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, User, Eye, EyeOff, Sparkles, ArrowRight, Coffee } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Clean up any trailing '?' if the browser arrived via a previous native GET submission
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search === '?') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function handleLogin(e?: React.FormEvent) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setLoading(true)
    setError('')

    if (!username.trim() || !password) {
      setError('Please enter both username and password')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid username or password')
        setLoading(false)
      } else {
        // Use full navigation so the browser synchronously attaches the Set-Cookie session header
        // and eliminates Next.js client-side router cookie race condition redirects
        window.location.href = '/dashboard'
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
        background: 'radial-gradient(ellipse at 50% 20%, #1F170B 0%, #120D05 45%, #0A0702 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Ambient luxury lighting orbs */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '650px',
          height: '650px',
          background: 'radial-gradient(circle, rgba(212, 175, 55, 0.12) 0%, rgba(184, 134, 11, 0.05) 45%, transparent 70%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
          borderRadius: '50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '-5%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(180, 83, 9, 0.08) 0%, transparent 65%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      {/* Subtle luxury geometric grid texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(rgba(212, 175, 55, 0.06) 1px, transparent 1px), radial-gradient(rgba(212, 175, 55, 0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          position: 'relative',
          zIndex: 10,
          animation: 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          {/* Emblem Icon */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(139, 115, 50, 0.08) 100%)',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), inset 0 0 16px rgba(212, 175, 55, 0.15)',
              marginBottom: '16px',
              position: 'relative',
            }}
          >
            <Coffee
              size={30}
              style={{
                color: '#E5C467',
                filter: 'drop-shadow(0 2px 8px rgba(212, 175, 55, 0.4))',
              }}
            />
            {/* Tiny spark dot */}
            <span
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#D4AF37',
                boxShadow: '0 0 10px #D4AF37',
              }}
            />
          </div>

          <h1
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '26px',
              fontWeight: '700',
              letterSpacing: '0.08em',
              background: 'linear-gradient(135deg, #FFF4D0 0%, #E6CA7A 40%, #B8860B 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '4px',
              textTransform: 'uppercase',
            }}
          >
            Kogna Coffee
          </h1>
        </div>

        {/* Ultra-Luxury Glassmorphic Login Card */}
        <div
          style={{
            background: 'linear-gradient(165deg, rgba(28, 22, 13, 0.85) 0%, rgba(18, 14, 8, 0.92) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(212, 175, 55, 0.22)',
            borderRadius: '24px',
            padding: '36px 30px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.03), inset 0 1px 0 rgba(212, 175, 55, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#10B981',
                  boxShadow: '0 0 8px #10B981',
                }}
              />
              <span style={{ fontSize: '12px', fontWeight: '600', letterSpacing: '0.06em', color: '#D4B95E', textTransform: 'uppercase' }}>
                Secure Access
              </span>
            </div>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(185, 28, 28, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '12px',
                padding: '12px 14px',
                color: '#FCA5A5',
                fontSize: '13px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                animation: 'shake 0.3s ease',
              }}
            >
              <span style={{ fontSize: '15px', color: '#EF4444' }}>✕</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} action="javascript:void(0);" method="POST">
            {/* Username Input */}
            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#C4B59D',
                  marginBottom: '8px',
                  letterSpacing: '0.03em',
                }}
              >
                Username or Staff ID
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#8A7B65',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <User size={17} />
                </span>
                <input
                  type="text"
                  placeholder="Enter staff username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    padding: '13px 14px 13px 44px',
                    background: 'rgba(12, 9, 4, 0.75)',
                    border: '1px solid rgba(212, 175, 55, 0.25)',
                    borderRadius: '12px',
                    color: '#FFF8E7',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#D4AF37'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212, 175, 55, 0.2)'
                    e.currentTarget.style.background = 'rgba(16, 12, 6, 0.95)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.25)'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.background = 'rgba(12, 9, 4, 0.75)'
                  }}
                />
              </div>
            </div>

            {/* Password Input */}
            <div style={{ marginBottom: '26px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#C4B59D',
                  marginBottom: '8px',
                  letterSpacing: '0.03em',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#8A7B65',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <Lock size={17} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter passcode"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '13px 44px 13px 44px',
                    background: 'rgba(12, 9, 4, 0.75)',
                    border: '1px solid rgba(212, 175, 55, 0.25)',
                    borderRadius: '12px',
                    color: '#FFF8E7',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#D4AF37'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212, 175, 55, 0.2)'
                    e.currentTarget.style.background = 'rgba(16, 12, 6, 0.95)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.25)'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.background = 'rgba(12, 9, 4, 0.75)'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#8A7B65',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#E6CA7A')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#8A7B65')}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Radiant Gold Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: '700',
                letterSpacing: '0.04em',
                background: loading
                  ? 'rgba(139, 115, 50, 0.5)'
                  : 'linear-gradient(135deg, #F3E099 0%, #D4AF37 50%, #9A7B2C 100%)',
                color: '#1A1204',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 8px 24px rgba(212, 175, 55, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                transform: 'translateY(0)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(212, 175, 55, 0.45)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(212, 175, 55, 0.28)'
                }
              }}
            >
              {loading ? (
                <>
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      border: '2px solid #1A1204',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                      display: 'inline-block',
                    }}
                  />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div
          style={{
            textAlign: 'center',
            marginTop: '24px',
            color: '#6E614D',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10B981',
              }}
            />
            <span style={{ color: '#8A7B65' }}>Cloud Sync Active · Addis Ababa</span>
          </div>
          <span style={{ fontSize: '11px', color: '#574B38' }}>
            MEBA TECH PRO · All Rights Reserved
          </span>
        </div>
      </div>
    </main>
  )
}
