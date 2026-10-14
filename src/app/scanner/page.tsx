'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  QrCode,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Camera,
  CameraOff,
  Keyboard,
  ArrowLeft,
  Volume2,
  VolumeX,
  Copy,
  Check,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  Info,
  Upload,
  Image as ImageIcon
} from 'lucide-react'

interface VerifiedReceipt {
  success: boolean
  provider: 'TELEBIRR' | 'CBE' | 'DASHEN' | 'AWASH' | 'BOA' | 'UNKNOWN'
  reference: string
  payerName?: string
  payerAccountOrPhone?: string
  receiverName?: string
  receiverAccount?: string
  isReceiverMatched?: boolean
  amount?: number
  currency: string
  dateTime?: string
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'UNKNOWN'
  errorMessage?: string
}

interface ScanHistoryItem {
  id: string
  reference: string
  provider: string
  amount?: number
  payerName?: string
  timestamp: string
  success: boolean
}

export default function QRScannerPage() {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [manualProvider, setManualProvider] = useState<'AUTO' | 'TELEBIRR' | 'CBE'>('AUTO')
  const [manualAccountDigits, setManualAccountDigits] = useState('')
  const [expectedAmount, setExpectedAmount] = useState('')

  // Scanner status
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Verification state
  const [verifying, setVerifying] = useState(false)
  const [verifiedResult, setVerifiedResult] = useState<VerifiedReceipt | null>(null)
  const [amountMatches, setAmountMatches] = useState<boolean | null>(null)
  const [copiedRef, setCopiedRef] = useState(false)

  // Recent scans drawer
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const html5QrCodeRef = useRef<any>(null)
  const scannerContainerId = 'kogna-qr-reader'
  const expectedAmountRef = useRef(expectedAmount)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileScanning, setFileScanning] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  useEffect(() => {
    expectedAmountRef.current = expectedAmount
  }, [expectedAmount])

  // Read URL query params on mount (?amount=450&provider=TELEBIRR)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const amt = params.get('amount')
      const prov = params.get('provider')
      if (amt) {
        setExpectedAmount(amt)
        expectedAmountRef.current = amt
      }
      if (prov === 'TELEBIRR' || prov === 'CBE') {
        setManualProvider(prov)
      }
    }
  }, [])

  // Play a pleasant digital verification chime via Web Audio API
  const playChime = useCallback((success: boolean) => {
    if (!soundEnabled) return
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return
      const ctx = new AudioContextClass()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      const now = ctx.currentTime
      if (success) {
        // High dual-tone success chime
        osc.frequency.setValueAtTime(587.33, now) // D5
        osc.frequency.setValueAtTime(880, now + 0.1) // A5
        gain.gain.setValueAtTime(0.15, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
        osc.start(now)
        osc.stop(now + 0.35)
      } else {
        // Low error buzz
        osc.frequency.setValueAtTime(220, now)
        gain.gain.setValueAtTime(0.2, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
        osc.start(now)
        osc.stop(now + 0.3)
      }
    } catch {
      // Audio autoplay restrictions fallback safely
    }
  }, [soundEnabled])

  // Trigger haptic vibration feedback
  const triggerHaptic = useCallback((success: boolean) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      if (success) {
        navigator.vibrate([40, 50, 40])
      } else {
        navigator.vibrate([100, 50, 100])
      }
    }
  }, [])

  // Call the backend verification API
  const verifyReference = useCallback(async (
    codeOrUrl: string, 
    prov: 'AUTO' | 'TELEBIRR' | 'CBE' = 'AUTO', 
    accountDigits?: string,
    expAmt?: number
  ) => {
    const clean = codeOrUrl.trim()
    if (!clean) return

    setVerifying(true)
    setVerifiedResult(null)
    setAmountMatches(null)

    try {
      const res = await fetch('/api/verify-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceOrUrl: clean,
          provider: prov,
          accountDigits: accountDigits || undefined,
          expectedAmount: expAmt || undefined,
        }),
      })

      const data = await res.json()

      if (res.ok && data.receipt) {
        const receipt: VerifiedReceipt = data.receipt
        setVerifiedResult(receipt)
        setAmountMatches(data.amountMatches ?? null)

        playChime(receipt.success)
        triggerHaptic(receipt.success)

        // Append to session history
        const historyEntry: ScanHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          reference: receipt.reference || clean,
          provider: receipt.provider || prov,
          amount: receipt.amount,
          payerName: receipt.payerName,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          success: receipt.success,
        }
        setHistory(prev => [historyEntry, ...prev.slice(0, 19)])
      } else {
        const detectedProv = clean.toUpperCase().startsWith('FT') || clean.toLowerCase().includes('cbe')
          ? 'CBE'
          : (clean.toLowerCase().includes('telebirr') || clean.toLowerCase().includes('ethiotelecom') ? 'TELEBIRR' : (prov === 'AUTO' ? 'UNKNOWN' : prov))
        const failReceipt: VerifiedReceipt = {
          success: false,
          provider: detectedProv,
          reference: clean,
          currency: 'ETB',
          status: 'FAILED',
          errorMessage: data.error || 'Receipt verification server could not validate this transaction.',
        }
        setVerifiedResult(failReceipt)
        playChime(false)
        triggerHaptic(false)
      }
    } catch (err: any) {
      const detectedProv = clean.toUpperCase().startsWith('FT') || clean.toLowerCase().includes('cbe')
        ? 'CBE'
        : (clean.toLowerCase().includes('telebirr') || clean.toLowerCase().includes('ethiotelecom') ? 'TELEBIRR' : 'UNKNOWN')
      const netErrorReceipt: VerifiedReceipt = {
        success: false,
        provider: detectedProv,
        reference: clean,
        currency: 'ETB',
        status: 'FAILED',
        errorMessage: err.message || 'Network connection failed while verifying with bank server.',
      }
      setVerifiedResult(netErrorReceipt)
      playChime(false)
      triggerHaptic(false)
    } finally {
      setVerifying(false)
    }
  }, [playChime, triggerHaptic])

  // Stop camera stream safely
  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop()
        }
        await html5QrCodeRef.current.clear()
      } catch (err) {
        console.warn('[Scanner] Stop warning:', err)
      }
      html5QrCodeRef.current = null
    }
    setCameraActive(false)
  }, [])

  // Handle scanning an image file / native camera snapshot
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileScanning(true)
    setFileError(null)

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      await stopScanner()
      
      const scanner = new Html5Qrcode(scannerContainerId)
      const decodedText = await scanner.scanFile(file, true)
      try { await scanner.clear() } catch {}
      
      const expAmt = expectedAmountRef.current ? parseFloat(expectedAmountRef.current) : undefined
      verifyReference(decodedText, 'AUTO', undefined, expAmt)
    } catch (err: any) {
      console.warn('[Scanner] File scan failed:', err)
      setFileError('Could not detect a clear QR code in this photo. Please hold the phone closer to the QR code and try again, or enter the reference code manually.')
    } finally {
      setFileScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Start camera stream using html5-qrcode
  const startScanner = useCallback(async (facing: 'environment' | 'user') => {
    setCameraError(null)
    setFileError(null)

    // Check secure context requirement (Chrome blocks getUserMedia on plain HTTP)
    if (typeof window !== 'undefined' && window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setCameraError('Live camera requires HTTPS or localhost. Please access via https://kogna.coffee/scanner or use "Snap / Upload Photo" below.')
      setCameraActive(false)
      return
    }

    // Dynamic import to prevent SSR issues
    const { Html5Qrcode } = await import('html5-qrcode')

    await stopScanner()

    try {
      const html5QrCode = new Html5Qrcode(scannerContainerId)
      html5QrCodeRef.current = html5QrCode

      const config = {
        fps: 15,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1.0,
      }

      // Try camera enumeration to pick back or front camera directly
      let cameraConstraint: any = { facingMode: facing }
      try {
        const cameras = await Html5Qrcode.getCameras()
        if (cameras && cameras.length > 0) {
          if (facing === 'environment') {
            const backCam = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1]
            if (backCam) cameraConstraint = backCam.id
          } else {
            cameraConstraint = cameras[0].id
          }
        }
      } catch (enumErr) {
        console.warn('[Scanner] Camera enumeration error:', enumErr)
      }

      const onScanSuccess = async (decodedText: string) => {
        await stopScanner()
        const expAmt = expectedAmountRef.current ? parseFloat(expectedAmountRef.current) : undefined
        verifyReference(decodedText, 'AUTO', undefined, expAmt)
      }

      try {
        await html5QrCode.start(cameraConstraint, config, onScanSuccess, () => {})
      } catch (firstTryErr) {
        console.warn('[Scanner] First start attempt failed, trying fallback facingMode:', firstTryErr)
        // Fallback to simple facingMode string constraint
        await html5QrCode.start({ facingMode: facing }, config, onScanSuccess, () => {})
      }

      setCameraActive(true)
    } catch (err: any) {
      console.error('[Scanner] Start failed:', err)
      const msg = err?.message || ''
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setCameraError('Camera permission is blocked. Please tap the lock / settings icon 🔒 in your browser URL bar, allow Camera access, and tap "Retry Camera".')
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setCameraError('No camera detected on this device. You can snap a photo with your native camera or enter the reference code manually.')
      } else {
        setCameraError(msg || 'Camera permission denied or camera not found.')
      }
      setCameraActive(false)
    }
  }, [stopScanner, verifyReference])

  // Switch camera between front and back
  const toggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    if (cameraActive) {
      startScanner(next)
    }
  }

  // Handle mode switches
  useEffect(() => {
    if (mode === 'camera' && !verifiedResult && !verifying) {
      startScanner(facingMode)
    } else {
      stopScanner()
    }

    return () => {
      stopScanner()
    }
  }, [mode, facingMode, verifiedResult, verifying, startScanner, stopScanner])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim()) return
    const expNum = expectedAmount ? parseFloat(expectedAmount) : undefined
    verifyReference(manualCode.trim(), manualProvider, manualAccountDigits.trim() || undefined, expNum)
  }

  const handleCopyRef = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedRef(true)
    setTimeout(() => setCopiedRef(false), 2000)
  }

  const resetForNextScan = () => {
    setVerifiedResult(null)
    setAmountMatches(null)
    setManualCode('')
    if (mode === 'camera') {
      startScanner(facingMode)
    }
  }

  const formatMoney = (amount?: number) => {
    if (typeof amount !== 'number') return '—'
    return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', minimumFractionDigits: 2 }).format(amount)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0B0F19',
      color: '#FFFFFF',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '560px',
      margin: '0 auto',
      position: 'relative'
    }}>
      
      {/* 1. App Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(15,23,42,0.85)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 40
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/dashboard/payment"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.06)',
              color: '#FFFFFF',
              textDecoration: 'none'
            }}
            title="Back to POS Payment"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: '700', fontSize: '15px', letterSpacing: '0.02em', color: '#FFFFFF' }}>
                Kogna Verifier
              </span>
              <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', padding: '1px 6px', borderRadius: '4px', background: 'rgba(180,138,30,0.2)', color: 'var(--gold-light)', border: '1px solid rgba(180,138,30,0.4)' }}>
                Anti-Fraud
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
              Telebirr & CBE Payment Verification
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: soundEnabled ? 'var(--gold)' : '#64748B',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title={soundEnabled ? 'Mute sound chime' : 'Enable sound chime'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </header>

      {/* 2. Mode Selector Pill Bar */}
      <div style={{ padding: '12px 16px', background: 'rgba(15,23,42,0.5)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'rgba(255,255,255,0.05)',
          padding: '3px',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <button
            type="button"
            onClick={() => { setMode('camera'); setVerifiedResult(null); }}
            style={{
              padding: '9px 12px',
              fontSize: '13px',
              fontWeight: mode === 'camera' ? '700' : '500',
              borderRadius: '8px',
              border: 'none',
              background: mode === 'camera' ? 'var(--gold)' : 'transparent',
              color: mode === 'camera' ? '#FFFFFF' : '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Camera size={15} />
            <span>Scan QR Code</span>
          </button>

          <button
            type="button"
            onClick={() => { setMode('manual'); stopScanner(); }}
            style={{
              padding: '9px 12px',
              fontSize: '13px',
              fontWeight: mode === 'manual' ? '700' : '500',
              borderRadius: '8px',
              border: 'none',
              background: mode === 'manual' ? 'var(--gold)' : 'transparent',
              color: mode === 'manual' ? '#FFFFFF' : '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Keyboard size={15} />
            <span>Enter Reference</span>
          </button>
        </div>
      </div>

      {/* 3. Main Scanning / Verification Area */}
      <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>

        {/* --- STATE A: VERIFYING IN PROGRESS --- */}
        {verifying && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(180,138,30,0.12)',
              border: '2px solid var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--gold)' }} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 6px 0', color: '#FFFFFF' }}>
              Querying Bank Server...
            </h3>
            <p style={{ fontSize: '13px', color: '#94A3B8', maxWidth: '300px', margin: 0, lineHeight: 1.5 }}>
              Connecting directly to Ethio Telecom / Commercial Bank of Ethiopia to validate transaction slip.
            </p>
          </div>
        )}

        {/* --- STATE B: VERIFICATION RESULT CARD --- */}
        {!verifying && verifiedResult && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div style={{
              background: '#131B2E',
              border: `2px solid ${verifiedResult.success ? '#059669' : '#DC2626'}`,
              borderRadius: '16px',
              padding: '24px 20px',
              boxShadow: verifiedResult.success ? '0 10px 30px rgba(5,150,105,0.15)' : '0 10px 30px rgba(220,38,38,0.15)',
              position: 'relative'
            }}>
              {/* Result Status Banner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: verifiedResult.success ? 'rgba(5,150,105,0.15)' : 'rgba(220,38,38,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {verifiedResult.success ? (
                    <CheckCircle2 size={26} color="#059669" />
                  ) : (
                    <XCircle size={26} color="#DC2626" />
                  )}
                </div>
                <div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: verifiedResult.success ? '#10B981' : '#EF4444'
                  }}>
                    {verifiedResult.success ? 'Official Bank Verified' : 'Verification Unsuccessful'}
                  </div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFFFFF', margin: '2px 0 0 0' }}>
                    {verifiedResult.success ? 'Legitimate Payment' : 'Unconfirmed / Invalid'}
                  </h2>
                </div>
              </div>

              {/* Amount Display */}
              {verifiedResult.success && typeof verifiedResult.amount === 'number' && (
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
                    Verified Amount Paid
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#10B981', fontVariantNumeric: 'tabular-nums', marginTop: '4px' }}>
                    {formatMoney(verifiedResult.amount)}
                  </div>
                  {amountMatches === false && (
                    <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <AlertTriangle size={13} />
                      Warning: Amount differs from expected order total
                    </div>
                  )}
                </div>
              )}

              {/* Details List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span style={{ color: '#94A3B8' }}>Provider:</span>
                  <b style={{ color: '#FFFFFF' }}>{verifiedResult.provider}</b>
                </div>

                {verifiedResult.payerName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                    <span style={{ color: '#94A3B8' }}>Payer Name:</span>
                    <b style={{ color: '#FFFFFF' }}>{verifiedResult.payerName}</b>
                  </div>
                )}

                {verifiedResult.payerAccountOrPhone && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                    <span style={{ color: '#94A3B8' }}>Payer Phone/Account:</span>
                    <span style={{ color: '#E2E8F0', fontFamily: 'monospace' }}>{verifiedResult.payerAccountOrPhone}</span>
                  </div>
                )}

                {verifiedResult.dateTime && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                    <span style={{ color: '#94A3B8' }}>Payment Timestamp:</span>
                    <span style={{ color: '#E2E8F0' }}>{verifiedResult.dateTime}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span style={{ color: '#94A3B8' }}>Transaction Ref:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--gold-light)', fontWeight: '700' }}>
                      {verifiedResult.reference}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyRef(verifiedResult.reference)}
                      style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '2px' }}
                      title="Copy reference code"
                    >
                      {copiedRef ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {verifiedResult.errorMessage && (
                  <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '8px', padding: '10px 12px', color: '#FCA5A5', fontSize: '12px', lineHeight: 1.4 }}>
                    <b>Server Error:</b> {verifiedResult.errorMessage}
                  </div>
                )}
              </div>
            </div>

            {/* Scan Next Action Button */}
            <button
              type="button"
              onClick={resetForNextScan}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #D4AF37 0%, #B48A1E 100%)',
                color: '#FFFFFF',
                fontWeight: '700',
                fontSize: '15px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(180,138,30,0.35)'
              }}
            >
              <Camera size={18} />
              <span>Scan Next Receipt</span>
            </button>
          </div>
        )}

        {/* --- STATE C: CAMERA QR VIEWFINDER --- */}
        {!verifying && !verifiedResult && mode === 'camera' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '100%',
              aspectRatio: '1 / 1',
              maxWidth: '360px',
              background: '#000000',
              borderRadius: '20px',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              border: '2px solid rgba(212,175,55,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {/* html5-qrcode video element mounts here */}
              <div id={scannerContainerId} style={{ width: '100%', height: '100%' }} />

              {/* Viewfinder Overlay Targeting Reticle */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '210px',
                height: '210px',
                border: '2px dashed rgba(212,175,55,0.6)',
                borderRadius: '16px',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  position: 'absolute',
                  width: '100%',
                  height: '2px',
                  background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
                  boxShadow: '0 0 8px #D4AF37'
                }} />
              </div>

              {cameraError && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(11,15,25,0.96)',
                  padding: '24px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  zIndex: 20
                }}>
                  <CameraOff size={38} color="#EF4444" style={{ marginBottom: '12px' }} />
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#FFFFFF', marginBottom: '6px' }}>
                    Camera Unavailable
                  </div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '18px', lineHeight: 1.5, maxWidth: '280px' }}>
                    {cameraError}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '240px' }}>
                    <button
                      type="button"
                      onClick={() => startScanner(facingMode)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        background: 'var(--gold)',
                        border: 'none',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <RefreshCw size={14} /> Retry Camera
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#F1F5F9',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Camera size={14} color="var(--gold)" /> Snap / Upload QR Photo
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode('manual')}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: '#94A3B8',
                        fontSize: '11px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      Enter Reference Code Manually
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Hidden native camera / photo upload input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileScan}
              style={{ display: 'none' }}
            />

            {/* File Scanning Spinner */}
            {fileScanning && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.3)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--gold-light)'
              }}>
                <RefreshCw size={14} className="animate-spin" />
                <span>Reading QR code from photo...</span>
              </div>
            )}

            {/* File Scan Error Message */}
            {fileError && (
              <div style={{
                marginTop: '12px',
                padding: '10px 12px',
                background: 'rgba(220,38,38,0.1)',
                border: '1px solid rgba(220,38,38,0.3)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#FCA5A5',
                lineHeight: 1.4
              }}>
                {fileError}
              </div>
            )}

            {/* Camera Controls & Secondary Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '360px', marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94A3B8' }}>
                  <Zap size={14} color="var(--gold-light)" />
                  <span>Point at Telebirr or CBE QR</span>
                </div>

                <button
                  type="button"
                  onClick={toggleFacingMode}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#E2E8F0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RefreshCw size={11} /> Flip Cam
                </button>
              </div>

              {/* Snap / Upload Fallback Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={fileScanning}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#CBD5E1',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Upload size={13} color="var(--gold)" />
                <span>Snap Photo / Upload QR Screenshot</span>
              </button>
            </div>
          </div>
        )}

        {/* --- STATE D: MANUAL REFERENCE CODE ENTRY --- */}
        {!verifying && !verifiedResult && mode === 'manual' && (
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#131B2E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                  Transaction Code or Slip URL
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FT24287... or Telebirr ID"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: '14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: '#0B0F19',
                    color: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Bank Provider
                  </label>
                  <select
                    value={manualProvider}
                    onChange={e => setManualProvider(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: '#0B0F19',
                      color: '#FFFFFF',
                      outline: 'none'
                    }}
                  >
                    <option value="AUTO">Auto Detect</option>
                    <option value="TELEBIRR">Telebirr</option>
                    <option value="CBE">CBE Birr / CBE</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Expected Bill (ETB)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Optional"
                    value={expectedAmount}
                    onChange={e => setExpectedAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: '#0B0F19',
                      color: '#FFFFFF',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {manualProvider === 'CBE' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>
                    CBE Receiver Account (Last 8 digits)
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="e.g. 10001234"
                    value={manualAccountDigits}
                    onChange={e => setManualAccountDigits(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: '#0B0F19',
                      color: '#FFFFFF',
                      outline: 'none'
                    }}
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!manualCode.trim()}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: manualCode.trim() ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                color: '#FFFFFF',
                fontWeight: '700',
                fontSize: '14px',
                cursor: manualCode.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <ShieldCheck size={18} />
              <span>Verify Transaction</span>
            </button>
          </form>
        )}
      </main>

      {/* 4. Bottom Collapsible Shift History Drawer */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(15,23,42,0.95)',
        backdropFilter: 'blur(10px)'
      }}>
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            color: '#94A3B8',
            fontSize: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <History size={14} color="var(--gold)" />
            <span>Recent Verified Scans ({history.length})</span>
          </div>
          {showHistory ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>

        {showHistory && (
          <div style={{
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '0 16px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748B', fontSize: '12px' }}>
                No receipts scanned in this session yet.
              </div>
            ) : history.map(item => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.success ? '#10B981' : '#EF4444' }} />
                    <span>{item.payerName || item.reference}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                    {item.provider} · {item.timestamp}
                  </div>
                </div>
                <b style={{ color: item.success ? '#10B981' : '#EF4444', fontVariantNumeric: 'tabular-nums' }}>
                  {typeof item.amount === 'number' ? formatMoney(item.amount) : (item.success ? 'OK' : 'FAIL')}
                </b>
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  )
}
