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
  Volume2,
  VolumeX,
  Copy,
  Check,
  History,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  X,
  Smartphone,
  Download,
  Sparkles
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
  isDuplicate?: boolean
  isUnderpaid?: boolean
  shortAmount?: number
  orderTotal?: number
  amount?: number
  currency: string
  dateTime?: string
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'UNKNOWN'
  isTimeout?: boolean
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

export interface OpenOrder {
  id: string
  tableId: string
  displayTitle: string
  isDelivery: boolean
  isTakeaway: boolean
  waiterName?: string
  createdAt: string
  subtotal: number
  total: number
  itemsCount: number
  itemsSummary?: string
  isVerified: boolean
  verifiedRef?: string | null
  verifiedProvider?: string | null
  verifiedAmount?: number | null
  verifiedPayer?: string | null
  verifiedReceiver?: string | null
  verifiedAt?: string | null
}

/**
/**
 * Universal detector and extractor for Ethiopian payment receipts:
 * - Modern CBE Mobile Banking QR codes (https://mbreciept.cbe.com.et/v2-... preserving case)
 * - Modern CBE direct tokens (v2-...)
 * - Legacy CBE FT codes & URLs (https://apps.cbe.com.et:100/?id=FT... or FT...)
 * - Telebirr URLs (https://transactioninfo.ethiotelecom.et/receipt/...)
 * - Telebirr SuperApp Base64 QR code (EMVCo with 000A[20 hex chars] -> ASCII)
 * - Telebirr 10-char alphanumeric codes (DJJ7261SX7)
 */
export interface DetectedTransaction {
  provider: 'TELEBIRR' | 'CBE' | 'UNKNOWN'
  reference: string
  officialUrl?: string
  isTelebirrCandidate: boolean
}

function detectProviderAndCleanRef(
  raw: string,
  defaultProvider: 'AUTO' | 'TELEBIRR' | 'CBE' = 'AUTO'
): DetectedTransaction {
  const clean = (raw || '').trim()
  if (!clean) {
    return {
      provider: defaultProvider === 'AUTO' ? 'UNKNOWN' : defaultProvider,
      reference: '',
      isTelebirrCandidate: false,
    }
  }

  // 1. CBE Modern Mobile Banking QR code / URL / Token (case-sensitive token preserved!)
  const cbeV2UrlMatch = clean.match(/(?:https?:\/\/)?(?:mbrecie?pt|mb)\.cbe\.com\.et\/(v2-[A-Za-z0-9_-]+|[A-Za-z0-9_-]{16,})/i)
  if (cbeV2UrlMatch) {
    const token = cbeV2UrlMatch[1] // DO NOT uppercase!
    return {
      provider: 'CBE',
      reference: token,
      officialUrl: `https://mbreciept.cbe.com.et/${token}`,
      isTelebirrCandidate: false,
    }
  }

  const directV2Match = clean.match(/^(v2-[A-Za-z0-9_-]{8,})/i)
  if (directV2Match) {
    return {
      provider: 'CBE',
      reference: directV2Match[1],
      officialUrl: `https://mbreciept.cbe.com.et/${directV2Match[1]}`,
      isTelebirrCandidate: false,
    }
  }

  // 2. CBE Legacy FT code or URL
  const cbeFtUrlMatch = clean.match(/[?&]id=(FT[0-9A-Za-z]{10})/i)
  if (cbeFtUrlMatch) {
    const ftCode = cbeFtUrlMatch[1].toUpperCase()
    return {
      provider: 'CBE',
      reference: ftCode,
      officialUrl: `https://apps.cbe.com.et:100/?id=${ftCode}`,
      isTelebirrCandidate: false,
    }
  }

  const directFtMatch = clean.match(/\b(FT[0-9A-Za-z]{10})\b/i)
  if (directFtMatch) {
    const ftCode = directFtMatch[1].toUpperCase()
    return {
      provider: 'CBE',
      reference: ftCode,
      officialUrl: `https://apps.cbe.com.et:100/?id=${ftCode}`,
      isTelebirrCandidate: false,
    }
  }

  // Any other CBE URL
  if (/cbe\.com\.et/i.test(clean)) {
    const tokenMatch = clean.match(/cbe\.com\.et\/([A-Za-z0-9_-]{8,})/i)
    const token = tokenMatch ? tokenMatch[1] : clean
    return {
      provider: 'CBE',
      reference: token,
      officialUrl: clean.startsWith('http') ? clean : `https://${clean}`,
      isTelebirrCandidate: false,
    }
  }

  // 3. Telebirr URL: /receipt/([A-Za-z0-9_-]+)
  const telebirrUrlMatch = clean.match(/\/receipt\/([A-Za-z0-9_-]+)/i)
  if (telebirrUrlMatch) {
    const code = telebirrUrlMatch[1].toUpperCase()
    return {
      provider: 'TELEBIRR',
      reference: code,
      officialUrl: `https://transactioninfo.ethiotelecom.et/receipt/${code}`,
      isTelebirrCandidate: true,
    }
  }

  // 4. Telebirr Base64 SuperApp QR code
  if (clean.length > 30 && /^[A-Za-z0-9+/=]+$/.test(clean)) {
    try {
      const binStr = typeof window !== 'undefined' && typeof window.atob === 'function'
        ? window.atob(clean)
        : (typeof Buffer !== 'undefined' ? Buffer.from(clean, 'base64').toString('binary') : '')

      const emvMatch = binStr.match(/000A([0-9a-fA-F]{20})/i)
      if (emvMatch) {
        const hex = emvMatch[1]
        let ascii = ''
        for (let i = 0; i < hex.length; i += 2) {
          ascii += String.fromCharCode(parseInt(hex.substr(i, 2), 16))
        }
        if (/^[A-Za-z0-9]{8,14}$/.test(ascii)) {
          const code = ascii.toUpperCase()
          return {
            provider: 'TELEBIRR',
            reference: code,
            officialUrl: `https://transactioninfo.ethiotelecom.et/receipt/${code}`,
            isTelebirrCandidate: true,
          }
        }
      }
    } catch {}
  }

  // 5. Explicit Telebirr 10-char code (e.g. DJJ7261SX7)
  const codeMatch = clean.match(/\b([A-Za-z0-9]{10})\b/i)
  if (
    codeMatch &&
    !/^(TELEBIRR|ETHIOTELE|COMMERCIAL)/i.test(codeMatch[1]) &&
    !/^[0-9]+$/.test(codeMatch[1]) &&
    !/^[A-Za-z]+$/.test(codeMatch[1])
  ) {
    const code = codeMatch[1].toUpperCase()
    return {
      provider: 'TELEBIRR',
      reference: code,
      officialUrl: `https://transactioninfo.ethiotelecom.et/receipt/${code}`,
      isTelebirrCandidate: true,
    }
  }

  // 6. Manual override or Fallback
  if (defaultProvider === 'CBE') {
    const isV2 = clean.startsWith('v2-')
    return {
      provider: 'CBE',
      reference: isV2 ? clean : clean.toUpperCase(),
      officialUrl: isV2 ? `https://mbreciept.cbe.com.et/${clean}` : `https://apps.cbe.com.et:100/?id=${clean}`,
      isTelebirrCandidate: false,
    }
  }

  if (defaultProvider === 'TELEBIRR') {
    const code = clean.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase()
    return {
      provider: 'TELEBIRR',
      reference: code,
      officialUrl: `https://transactioninfo.ethiotelecom.et/receipt/${code}`,
      isTelebirrCandidate: true,
    }
  }

  // Generic fallback
  const fallbackCode = clean.replace(/[^A-Za-z0-9_-]/g, '')
  return {
    provider: 'UNKNOWN',
    reference: fallbackCode,
    isTelebirrCandidate: false,
  }
}

export default function QRScannerPage() {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [manualProvider, setManualProvider] = useState<'AUTO' | 'TELEBIRR' | 'CBE'>('AUTO')
  const [manualAccountDigits, setManualAccountDigits] = useState('')
  const [expectedAmount, setExpectedAmount] = useState('')

  // Open Orders integration
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isLinkingOrder, setIsLinkingOrder] = useState(false)
  const [linkedSuccessMessage, setLinkedSuccessMessage] = useState<string | null>(null)

  // Scanner status
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
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

  // App & Refresh states
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstalledApp, setIsInstalledApp] = useState(false)
  const [showAppModal, setShowAppModal] = useState(false)

  const html5QrCodeRef = useRef<any>(null)
  const scannerContainerId = 'kogna-qr-reader'
  const expectedAmountRef = useRef(expectedAmount)
  const selectedOrderIdRef = useRef(selectedOrderId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileScanning, setFileScanning] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const isStartingRef = useRef(false)
  const isStoppingRef = useRef(false)
  const isVerifyingRef = useRef(false)
  const scanLockRef = useRef(false)
  const lastScannedTextRef = useRef<string | null>(null)
  const lastScannedTimeRef = useRef<number>(0)
  const mountedRef = useRef(true)

  // Detect standalone app mode (PWA or Android WebView) and capture install prompt
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        Boolean((window as any).AndroidBridge)
      setIsInstalledApp(isStandalone)

      const handleBeforeInstall = (e: any) => {
        e.preventDefault()
        setDeferredPrompt(e)
      }
      window.addEventListener('beforeinstallprompt', handleBeforeInstall)
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId
  }, [selectedOrderId])

  // Fetch open orders from API (with strict anti-cache headers)
  const fetchOpenOrders = useCallback(async () => {
    try {
      const savedToken = typeof window !== 'undefined' ? (localStorage.getItem('scanner_token') || 'kogna_scanner_secure_2026') : ''
      const headers: Record<string, string> = {}
      if (savedToken) headers['x-scanner-token'] = savedToken

      const res = await fetch(`/api/scanner/orders?_t=${Date.now()}`, {
        headers,
        cache: 'no-store'
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.orders)) {
          setOpenOrders(data.orders)
          // If the currently selected order was paid and removed from open orders, deselect it immediately
          setSelectedOrderId(prev => {
            if (prev && !data.orders.some((o: any) => o.id === prev)) {
              return null
            }
            return prev
          })
        }
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchOpenOrders()
    const interval = setInterval(fetchOpenOrders, 3000)

    let es: EventSource | null = null
    try {
      es = new EventSource('/api/scanner/events')
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'ORDER_VERIFIED' || payload.type === 'ORDER_CLEARED' || payload.type === 'ORDER_PAID') {
            fetchOpenOrders()
          }
        } catch {}
      }
    } catch {}

    return () => {
      clearInterval(interval)
      if (es) {
        try { es.close() } catch {}
      }
    }
  }, [fetchOpenOrders])

  const handleSelectOrder = (order: OpenOrder | null) => {
    if (!order) {
      setSelectedOrderId(null)
      return
    }
    setSelectedOrderId(order.id)
    setExpectedAmount(order.total.toString())
    expectedAmountRef.current = order.total.toString()
    setLinkedSuccessMessage(null)
  }

  const handleLinkToOrder = async (targetOrderId: string, isManualConfirm = false) => {
    if (!verifiedResult || !verifiedResult.reference) return
    const targetOrder = openOrders.find(o => o.id === targetOrderId)
    const targetBill = targetOrder?.total || 0
    if (typeof verifiedResult.amount === 'number' && targetBill > 0 && verifiedResult.amount < targetBill - 0.5) {
      alert(`⚠️ CANNOT ATTACH: The verified amount (${verifiedResult.amount.toFixed(2)} ETB) is less than ${targetOrder?.displayTitle || 'Order'}'s bill (${targetBill.toFixed(2)} ETB). Receipt was NOT attached! Please collect the full amount.`)
      return
    }
    setIsLinkingOrder(true)
    setLinkedSuccessMessage(null)
    try {
      const res = await fetch('/api/scanner/verify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: targetOrderId,
          reference: verifiedResult.reference,
          provider: verifiedResult.provider,
          amount: verifiedResult.amount || (targetBill > 0 ? targetBill : undefined),
          payerName: verifiedResult.payerName,
          receiverName: verifiedResult.receiverName,
          manualConfirmed: isManualConfirm,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const targetOrder = openOrders.find(o => o.id === targetOrderId)
        setLinkedSuccessMessage(`⚡ Verified payment sent to Cashier for ${targetOrder?.displayTitle || 'Order'}!`)
        fetchOpenOrders()
      } else {
        alert(data.error || 'Failed to link payment to order')
      }
    } catch {
      alert('Network error linking payment to order')
    } finally {
      setIsLinkingOrder(false)
    }
  }

  const handleClearOrderVerification = async (targetOrderId: string) => {
    if (!confirm('Clear verified payment for this table/order?')) return
    try {
      const savedToken = typeof window !== 'undefined' ? (localStorage.getItem('scanner_token') || 'kogna_scanner_secure_2026') : ''
      const headers: Record<string, string> = {}
      if (savedToken) headers['x-scanner-token'] = savedToken

      const res = await fetch(`/api/scanner/verify-order?orderId=${encodeURIComponent(targetOrderId)}`, {
        method: 'DELETE',
        headers,
      })
      const data = await res.json()
      if (data.success) {
        setLinkedSuccessMessage('Payment verification cleared for this order.')
        fetchOpenOrders()
      } else {
        alert(data.error || 'Failed to clear verification')
      }
    } catch {
      alert('Network error clearing verification')
    }
  }

  useEffect(() => {
    expectedAmountRef.current = expectedAmount
  }, [expectedAmount])

  // Ensure scanner page never uses a stale service worker cache
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          reg.unregister()
        }
      })
      if ('caches' in window) {
        caches.keys().then(names => {
          for (const name of names) {
            caches.delete(name)
          }
        })
      }
    }
  }, [])

  // Read URL query params on mount (?amount=450&provider=TELEBIRR&key=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const key = params.get('key') || params.get('scanner_token')
      if (key) {
        localStorage.setItem('scanner_token', key)
        document.cookie = `scanner_token=${key}; path=/; max-age=31536000; SameSite=Lax`
      } else {
        const existing = localStorage.getItem('scanner_token') || 'kogna_scanner_secure_2026'
        localStorage.setItem('scanner_token', existing)
        document.cookie = `scanner_token=${existing}; path=/; max-age=31536000; SameSite=Lax`
      }

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

  // Play digital verification chime via Web Audio API
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
        osc.frequency.setValueAtTime(587.33, now) // D5
        osc.frequency.setValueAtTime(880, now + 0.1) // A5
        gain.gain.setValueAtTime(0.15, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
        osc.start(now)
        osc.stop(now + 0.35)
      } else {
        osc.frequency.setValueAtTime(220, now)
        gain.gain.setValueAtTime(0.2, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
        osc.start(now)
        osc.stop(now + 0.3)
      }
    } catch {}
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

  // Call the backend verification API with automatic retry
  const verifyReference = useCallback(async (
    codeOrUrl: string, 
    prov: 'AUTO' | 'TELEBIRR' | 'CBE' = 'AUTO', 
    accountDigits?: string,
    expAmt?: number,
    htmlOverride?: string
  ) => {
    const clean = codeOrUrl.trim()
    if (!clean) return
    if (isVerifyingRef.current) return
    isVerifyingRef.current = true

    setVerifying(true)
    setVerifiedResult(null)
    setAmountMatches(null)

    let finalResultData: any = null
    let finalReceiptPayload: any = null
    let isGatewayDelay = false
    let isDup = false
    let isRecvMismatch = false
    let isUnder = false
    let isSuccess = false

    const detected = detectProviderAndCleanRef(clean, prov)
    const effectiveProvider = prov !== 'AUTO' ? prov : (detected.provider !== 'UNKNOWN' ? detected.provider : 'AUTO')
    const candidateId = detected.reference || clean

    try {
      // ⚡ Option B: Device-level fetch via Android Native Bridge if running inside KognaVerifier APK
      let htmlContent: string | undefined = htmlOverride

      if (!htmlContent && detected.isTelebirrCandidate && typeof (window as any).AndroidBridge?.fetchReceipt === 'function') {
        try {
          if (candidateId && candidateId.length >= 8 && candidateId.length <= 14) {
            htmlContent = await new Promise<string>((resolve) => {
              const cbId = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 1000)
              const timer = setTimeout(() => {
                delete (window as any)[cbId]
                resolve('')
              }, 9000)
              ;(window as any)[cbId] = (success: boolean, result: string) => {
                clearTimeout(timer)
                delete (window as any)[cbId]
                if (success && typeof result === 'string' && result.length > 200) {
                  resolve(result)
                } else {
                  resolve('')
                }
              }
              try {
                ;(window as any).AndroidBridge.fetchReceipt(
                  `https://transactioninfo.ethiotelecom.et/receipt/${candidateId}`,
                  cbId
                )
              } catch {
                clearTimeout(timer)
                resolve('')
              }
            })
          }
        } catch (bridgeErr) {
          console.warn('[Scanner] AndroidBridge fetch error:', bridgeErr)
        }
      }

      const activeOrderId = selectedOrderIdRef.current || undefined
      const res = await fetch('/api/verify-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceOrUrl: candidateId || clean,
          provider: effectiveProvider,
          accountDigits: accountDigits || undefined,
          expectedAmount: expAmt || undefined,
          orderId: activeOrderId,
          htmlContent: htmlContent || undefined,
        }),
      })

      const data = await res.json()
      const receiptPayload = data.receipt || null
      finalResultData = data
      finalReceiptPayload = receiptPayload

      isDup = Boolean(
        data.duplicate ||
        receiptPayload?.isDuplicate ||
        data.error?.toLowerCase().includes('duplicate') ||
        data.error?.toLowerCase().includes('already used') ||
        receiptPayload?.errorMessage?.toLowerCase().includes('already used')
      )
      isRecvMismatch = Boolean(
        data.receiverMismatch ||
        receiptPayload?.isReceiverMatched === false ||
        data.error?.toLowerCase().includes('receiver mismatch') ||
        receiptPayload?.errorMessage?.toLowerCase().includes('receiver mismatch')
      )
      isUnder = Boolean(
        data.underpaid ||
        receiptPayload?.isUnderpaid ||
        data.error?.toLowerCase().includes('amount too low') ||
        receiptPayload?.errorMessage?.toLowerCase().includes('amount too low')
      )
      isGatewayDelay = Boolean(
        !isDup && !isRecvMismatch && !isUnder &&
        (receiptPayload?.isTimeout ||
         receiptPayload?.status === 'PENDING' ||
         data.error?.toLowerCase().includes('timed out') ||
         receiptPayload?.errorMessage?.toLowerCase().includes('timed out'))
      )

      if (res.ok && receiptPayload && receiptPayload.success && !isRecvMismatch && !isUnder && !isDup) {
        isSuccess = true
      }

      if (isSuccess && finalReceiptPayload) {
        const receipt: VerifiedReceipt = {
          ...finalReceiptPayload,
          isDuplicate: false,
          isReceiverMatched: true,
          isUnderpaid: false,
        }
        setVerifiedResult(receipt)
        setAmountMatches(finalResultData?.amountMatches ?? null)

        if (finalResultData?.linkedOrder) {
          const target = openOrders.find(o => o.id === finalResultData.linkedOrder.id)
          setLinkedSuccessMessage(`⚡ Automatically sent to Cashier POS for ${target?.displayTitle || 'Table'}!`)
          fetchOpenOrders()
        }

        playChime(true)
        triggerHaptic(true)

        const historyEntry: ScanHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          reference: receipt.reference || clean,
          provider: receipt.provider || prov,
          amount: receipt.amount,
          payerName: receipt.payerName,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          success: true,
        }
        setHistory(prev => [historyEntry, ...prev.slice(0, 19)])
      } else {
        const detectedProv = detected.provider !== 'UNKNOWN' ? detected.provider : (prov === 'AUTO' ? 'UNKNOWN' : prov)

        const failReceipt: VerifiedReceipt = {
          success: false,
          provider: finalReceiptPayload?.provider || detectedProv,
          reference: finalReceiptPayload?.reference || candidateId || clean,
          currency: finalReceiptPayload?.currency || 'ETB',
          status: isGatewayDelay ? 'PENDING' : (finalReceiptPayload?.status || 'FAILED'),
          isTimeout: isGatewayDelay,
          isDuplicate: isDup,
          isReceiverMatched: isRecvMismatch ? false : (finalReceiptPayload?.isReceiverMatched ?? true),
          isUnderpaid: isUnder,
          shortAmount: finalResultData?.shortAmount || (finalResultData?.orderTotal && finalReceiptPayload?.amount ? finalResultData.orderTotal - finalReceiptPayload.amount : undefined),
          orderTotal: finalResultData?.orderTotal,
          receiverName: finalReceiptPayload?.receiverName,
          receiverAccount: finalReceiptPayload?.receiverAccount,
          payerName: finalReceiptPayload?.payerName,
          payerAccountOrPhone: finalReceiptPayload?.payerAccountOrPhone,
          amount: typeof finalReceiptPayload?.amount === 'number' ? finalReceiptPayload.amount : undefined,
          dateTime: finalReceiptPayload?.dateTime,
          errorMessage: finalResultData?.error || finalReceiptPayload?.errorMessage || (isGatewayDelay ? (detectedProv === 'CBE' ? 'CBE receipt gateway timed out. Tap "Open Official CBE Slip in Browser" below.' : 'Ethio Telecom receipt gateway timed out. Tap "Open Official Slip in Browser" below.') : 'Receipt verification server could not validate this transaction.'),
        }

        setVerifiedResult(failReceipt)
        setAmountMatches(false)
        playChime(false)
        triggerHaptic(false)
      }
    } catch (err: any) {
      const detectedProv = detected.provider !== 'UNKNOWN' ? detected.provider : 'UNKNOWN'
      const isNetTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout')
      const netErrorReceipt: VerifiedReceipt = {
        success: false,
        provider: detectedProv,
        reference: candidateId || clean,
        currency: 'ETB',
        status: isNetTimeout ? 'PENDING' : 'FAILED',
        isTimeout: isNetTimeout,
        errorMessage: isNetTimeout
          ? `Network timed out connecting to ${detectedProv === 'CBE' ? 'CBE' : (detectedProv === 'TELEBIRR' ? 'Ethio Telecom' : 'bank')}. Tap "Open Official Slip in Browser" below.`
          : (err.message || 'Network connection failed while verifying with bank server.'),
      }
      setVerifiedResult(netErrorReceipt)
      playChime(false)
      triggerHaptic(false)
    } finally {
      setVerifying(false)
      isVerifyingRef.current = false
    }
  }, [playChime, triggerHaptic, openOrders, fetchOpenOrders])

  // Stop camera stream safely
  const stopScanner = useCallback(async () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    try {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            try { html5QrCodeRef.current.pause(true) } catch {}
            await html5QrCodeRef.current.stop()
          }
          await html5QrCodeRef.current.clear()
        } catch (err) {
          console.warn('[Scanner] Stop warning:', err)
        }
        html5QrCodeRef.current = null
      }

      try {
        const container = document.getElementById(scannerContainerId)
        const video = container?.querySelector('video') as HTMLVideoElement | null
        if (video && video.srcObject) {
          const stream = video.srcObject as MediaStream
          stream.getTracks().forEach(t => t.stop())
          video.srcObject = null
        }
      } catch {}

      if (mountedRef.current) {
        setCameraActive(false)
      }
    } finally {
      isStoppingRef.current = false
    }
  }, [])

  // Handle scanning an image file / native camera snapshot
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    scanLockRef.current = true
    setFileScanning(true)
    setFileError(null)

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      await stopScanner()
      setIsCameraOpen(false)
      
      const scanner = new Html5Qrcode(scannerContainerId)
      const decodedText = await scanner.scanFile(file, true)
      try { await scanner.clear() } catch {}
      
      const expAmt = expectedAmountRef.current ? parseFloat(expectedAmountRef.current) : undefined
      verifyReference(decodedText, 'AUTO', undefined, expAmt)
    } catch (err: any) {
      console.warn('[Scanner] File scan failed:', err)
      setFileError('Could not detect a clear QR code in this photo. Please hold the phone closer to the QR code and try again, or enter the reference code manually.')
      scanLockRef.current = false
    } finally {
      setFileScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Start camera stream using html5-qrcode
  const startScanner = useCallback(async (facing: 'environment' | 'user') => {
    if (isStartingRef.current || isStoppingRef.current) return
    isStartingRef.current = true
    setCameraStarting(true)
    setCameraError(null)
    setFileError(null)

    if (typeof window !== 'undefined' && window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      if (mountedRef.current) {
        setCameraError('Live camera requires HTTPS or localhost. Please access via https://kogna.coffee/scanner or use "Upload / Snap Photo" below.')
        setCameraActive(false)
        setCameraStarting(false)
      }
      isStartingRef.current = false
      return
    }

    try {
      const { Html5Qrcode } = await import('html5-qrcode')

      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop()
          }
          await html5QrCodeRef.current.clear()
        } catch {}
        html5QrCodeRef.current = null
      }

      if (!mountedRef.current) {
        isStartingRef.current = false
        setCameraStarting(false)
        return
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        verbose: false,
      })
      html5QrCodeRef.current = html5QrCode

      const config = {
        fps: 24, // 24 FPS for 2x faster frame capture
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
          const edge = Math.max(200, Math.floor(minEdge * 0.8))
          return { width: edge, height: edge }
        },
        aspectRatio: 1.0,
      }

      const onScanSuccess = async (decodedText: string) => {
        const now = Date.now()
        if (scanLockRef.current) return
        if (lastScannedTextRef.current === decodedText && now - lastScannedTimeRef.current < 4000) return

        scanLockRef.current = true
        lastScannedTextRef.current = decodedText
        lastScannedTimeRef.current = now

        try {
          if (html5QrCodeRef.current) {
            try { html5QrCodeRef.current.pause(true) } catch {}
          }
        } catch {}

        await stopScanner()
        setIsCameraOpen(false)

        const expAmt = expectedAmountRef.current ? parseFloat(expectedAmountRef.current) : undefined
        verifyReference(decodedText, 'AUTO', undefined, expAmt)
      }

      const primaryTarget: any = { facingMode: facing }

      const startWithTimeout = (target: any, timeoutMs = 25000) => {
        return Promise.race([
          html5QrCode.start(target, config, onScanSuccess, () => {}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('CAMERA_TIMEOUT')), timeoutMs))
        ])
      }

      try {
        await startWithTimeout(primaryTarget, 20000)
      } catch (firstTryErr: any) {
        console.warn('[Scanner] Primary camera start failed, attempting device enumeration fallback:', firstTryErr)
        try {
          const cameras = await Html5Qrcode.getCameras().catch(() => [])
          if (cameras && cameras.length > 0) {
            const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent || '')
            const chosen = isMobile
              ? (cameras.find((c: any) => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1])
              : (cameras.find((c: any) => /front|user|integrated|wide vision/i.test(c.label)) || cameras[0])
            await startWithTimeout(chosen.id, 15000)
          } else {
            const opposite = facing === 'environment' ? 'user' : 'environment'
            await startWithTimeout({ facingMode: opposite }, 10000)
          }
        } catch {
          throw firstTryErr
        }
      }

      if (mountedRef.current) {
        setCameraActive(true)
      }
    } catch (err: any) {
      console.error('[Scanner] Start failed:', err)
      const msg = err?.message || ''
      if (mountedRef.current) {
        if (msg === 'CAMERA_TIMEOUT' || msg.includes('CAMERA_TIMEOUT')) {
          setCameraError('Camera took too long to respond. Please tap "Retry Camera" or tap "Upload / Snap Photo" below.')
        } else if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setCameraError('Camera permission is blocked. Please tap the lock 🔒 or shield in your browser URL bar, allow Camera access, and tap "Retry Camera".')
        } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError') || msg.includes('Overconstrained')) {
          setCameraError('No suitable camera detected on this device. You can snap a photo with your native camera or enter the reference code manually.')
        } else {
          setCameraError(msg || 'Camera permission denied or camera not found.')
        }
        setCameraActive(false)
      }
    } finally {
      if (mountedRef.current) {
        setCameraStarting(false)
      }
      isStartingRef.current = false
    }
  }, [stopScanner, verifyReference])

  const handleStartScan = () => {
    setIsCameraOpen(true)
    setCameraError(null)
    setFileError(null)
    setTimeout(() => {
      startScanner(facingMode)
    }, 50)
  }

  const handleStopScan = () => {
    stopScanner()
    setIsCameraOpen(false)
    setCameraError(null)
  }

  const toggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    if (cameraActive || isCameraOpen) {
      startScanner(next)
    }
  }

  // Cleanup on unmount or manual mode
  useEffect(() => {
    mountedRef.current = true
    if (mode === 'manual') {
      stopScanner()
      setIsCameraOpen(false)
    }
    return () => {
      mountedRef.current = false
      stopScanner()
    }
  }, [mode, stopScanner])

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
    scanLockRef.current = false
    lastScannedTextRef.current = null
    lastScannedTimeRef.current = 0
    isVerifyingRef.current = false
    setIsLinkingOrder(false)
    setLinkedSuccessMessage(null)
    setVerifiedResult(null)
    setAmountMatches(null)
    setManualCode('')
    if (mode === 'camera') {
      setIsCameraOpen(true)
      setTimeout(() => {
        startScanner(facingMode)
      }, 50)
    }
  }

  const formatMoney = (amount?: number) => {
    if (typeof amount !== 'number') return '—'
    return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', minimumFractionDigits: 2 }).format(amount)
  }

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await fetchOpenOrders()
      setCameraError(null)
      if (isCameraOpen && !verifying && html5QrCodeRef.current) {
        try {
          await stopScanner()
          await startScanner(facingMode)
        } catch {}
      }
    } catch (err) {
      console.error('Refresh error:', err)
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }, [isRefreshing, fetchOpenOrders, isCameraOpen, verifying, stopScanner, startScanner, facingMode])

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt()
        const choice = await deferredPrompt.userChoice
        if (choice.outcome === 'accepted') {
          setIsInstalledApp(true)
        }
        setDeferredPrompt(null)
      } catch {
        setShowAppModal(true)
      }
    } else {
      setShowAppModal(true)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#F8FAFC',
      color: '#0F172A',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: '560px',
      margin: '0 auto',
      position: 'relative',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>
      {/* Laser line CSS animation & spin */}
      <style>{`
        @keyframes kLineScan {
          0% { top: 6%; opacity: 0.85; }
          50% { top: 92%; opacity: 1; }
          100% { top: 6%; opacity: 0.85; }
        }
        @keyframes kSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .kogna-laser-line {
          position: absolute;
          left: 6%;
          right: 6%;
          height: 3px;
          background: linear-gradient(90deg, transparent 0%, #D4AF37 50%, transparent 100%);
          box-shadow: 0 0 14px #D4AF37;
          border-radius: 2px;
          animation: kLineScan 2.4s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>
      
      {/* 1. App Header (Clean Light Theme) */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'max(12px, env(safe-area-inset-top)) 16px 12px 16px',
        borderBottom: '1px solid #E2E8F0',
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        width: '100%',
        boxSizing: 'border-box',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
            border: '1px solid #FCD34D',
            color: '#B48A1E',
            boxShadow: '0 1px 3px rgba(180, 138, 30, 0.12)'
          }}>
            <QrCode size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: '800', fontSize: '15px', letterSpacing: '-0.01em', color: '#0F172A' }}>
                Kogna Verifier
              </span>
              {isInstalledApp ? (
                <span style={{
                  fontSize: '9px',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '2px 6px',
                  borderRadius: '5px',
                  background: '#ECFDF5',
                  color: '#059669',
                  border: '1px solid #A7F3D0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#059669' }}></span>
                  App
                </span>
              ) : (
                <span style={{
                  fontSize: '9px',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '2px 6px',
                  borderRadius: '5px',
                  background: '#FEF3C7',
                  color: '#B45309',
                  border: '1px solid #FCD34D'
                }}>
                  Anti-Fraud
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748B', fontWeight: '500' }}>
              Telebirr & CBE Slip Verifier
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              background: isRefreshing ? '#FEF3C7' : '#F1F5F9',
              border: `1px solid ${isRefreshing ? '#FCD34D' : '#E2E8F0'}`,
              color: isRefreshing ? '#B48A1E' : '#475569',
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              touchAction: 'manipulation',
              transition: 'all 0.15s ease'
            }}
            title="Refresh open orders & scanner"
          >
            <RefreshCw
              size={16}
              style={{
                animation: isRefreshing ? 'kSpin 0.7s linear infinite' : 'none',
                transformOrigin: 'center'
              }}
            />
          </button>

          {/* Sound Mute/Unmute */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              color: soundEnabled ? '#B48A1E' : '#94A3B8',
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              touchAction: 'manipulation',
              transition: 'all 0.15s ease'
            }}
            title={soundEnabled ? 'Mute audio chime' : 'Enable audio chime'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Get App Button (if not already installed) */}
          {!isInstalledApp && (
            <button
              type="button"
              onClick={handleInstallApp}
              style={{
                background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                border: '1px solid #334155',
                color: '#F8FAFC',
                padding: '6px 10px',
                borderRadius: '9px',
                fontSize: '11px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
              title="Install Scanner App on Phone"
            >
              <Smartphone size={13} color="#FCD34D" />
              <span>Get App</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. Mode Selector Pill Bar */}
      <div style={{
        padding: '12px 16px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        position: 'relative',
        zIndex: 30
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: '#F1F5F9',
          padding: '4px',
          borderRadius: '12px',
          border: '1px solid #E2E8F0'
        }}>
          <button
            type="button"
            onClick={() => {
              scanLockRef.current = false
              lastScannedTextRef.current = null
              lastScannedTimeRef.current = 0
              isVerifyingRef.current = false
              setMode('camera')
              setVerifiedResult(null)
            }}
            style={{
              padding: '10px 12px',
              fontSize: '13px',
              fontWeight: mode === 'camera' ? '700' : '600',
              borderRadius: '9px',
              border: mode === 'camera' ? '1px solid rgba(0,0,0,0.06)' : 'none',
              background: mode === 'camera' ? '#FFFFFF' : 'transparent',
              color: mode === 'camera' ? '#0F172A' : '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              boxShadow: mode === 'camera' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
              touchAction: 'manipulation'
            }}
          >
            <Camera size={15} color={mode === 'camera' ? '#B48A1E' : '#64748B'} />
            <span>Scan QR Code</span>
          </button>

          <button
            type="button"
            onClick={() => { setMode('manual'); stopScanner(); setIsCameraOpen(false); }}
            style={{
              padding: '10px 12px',
              fontSize: '13px',
              fontWeight: mode === 'manual' ? '700' : '600',
              borderRadius: '9px',
              border: mode === 'manual' ? '1px solid rgba(0,0,0,0.06)' : 'none',
              background: mode === 'manual' ? '#FFFFFF' : 'transparent',
              color: mode === 'manual' ? '#0F172A' : '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              boxShadow: mode === 'manual' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
              touchAction: 'manipulation'
            }}
          >
            <Keyboard size={15} color={mode === 'manual' ? '#B48A1E' : '#64748B'} />
            <span>Enter Reference</span>
          </button>
        </div>
      </div>

      {/* 2.5 Active Open Orders Bar (Light theme) */}
      <div style={{
        padding: '10px 16px 14px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        position: 'relative',
        zIndex: 30
      }}>
        {selectedOrderId ? (
          (() => {
            const selected = openOrders.find(o => o.id === selectedOrderId)
            return (
              <div style={{
                background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                border: '1.5px solid #FCD34D',
                borderRadius: '12px',
                padding: '11px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                boxShadow: '0 2px 8px rgba(180,138,30,0.08)'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#B45309', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Target Order:
                    </span>
                    {selected?.isDelivery && <span style={{ fontSize: '13px' }}>🛵</span>}
                    {selected?.isTakeaway && <span style={{ fontSize: '13px' }}>🥡</span>}
                    <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: '800' }}>
                      {selected?.displayTitle || 'Order'}
                    </span>
                    {selected?.isVerified && (
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', fontWeight: '800' }}>
                        Verified
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>
                    Expected Bill: <b style={{ color: '#92400E' }}>{selected?.total.toFixed(2)} ETB</b> · {selected?.waiterName} ({selected?.itemsCount} items)
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {selected?.isVerified && (
                    <button
                      type="button"
                      onClick={() => handleClearOrderVerification(selected.id)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid #FECACA',
                        background: '#FEF2F2',
                        color: '#DC2626',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(220,38,38,0.06)'
                      }}
                    >
                      Clear Slip
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSelectOrder(null)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #FCD34D',
                      background: '#FFFFFF',
                      color: '#92400E',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>
            )
          })()
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Open Orders ({openOrders.length}):
                </span>
                <button
                  type="button"
                  onClick={() => fetchOpenOrders()}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Refresh open orders"
                >
                  <RefreshCw size={11} />
                </button>
              </div>
              <span style={{ fontSize: '11px', color: '#B45309', fontWeight: '600' }}>
                Tap a table to link payment
              </span>
            </div>
            {openOrders.length > 0 ? (
              <div style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '4px',
                scrollbarWidth: 'none'
              }}>
                {openOrders.map(order => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => handleSelectOrder(order)}
                    style={{
                      flexShrink: 0,
                      padding: '8px 12px',
                      borderRadius: '10px',
                      border: order.isVerified
                        ? '1px solid #A7F3D0'
                        : '1px solid #E2E8F0',
                      background: order.isVerified
                        ? '#ECFDF5'
                        : '#F8FAFC',
                      color: '#0F172A',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {order.isDelivery && <span style={{ fontSize: '11px' }}>🛵</span>}
                      {order.isTakeaway && <span style={{ fontSize: '11px' }}>🥡</span>}
                      <span style={{ fontWeight: '700', fontSize: '12px', color: order.isVerified ? '#065F46' : '#0F172A' }}>
                        {order.displayTitle}
                      </span>
                      {order.isVerified && (
                        <span style={{ fontSize: '9px', background: '#059669', color: '#FFFFFF', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                          ✓
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: '#B45309', fontWeight: '800' }}>
                      {order.total.toFixed(2)} ETB
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', padding: '4px 0' }}>
                No active open orders currently. You can still scan any slip directly.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Main Scanning / Verification Area */}
      <main style={{ flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column' }}>

        {/* --- STATE A: VERIFYING IN PROGRESS --- */}
        {verifying && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 20px',
            textAlign: 'center',
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
          }}>
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: '#FFFBEB',
              border: '2px solid #FCD34D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              boxShadow: '0 4px 16px rgba(180,138,30,0.15)'
            }}>
              <RefreshCw size={34} className="animate-spin" style={{ color: '#B48A1E' }} />
            </div>
            <h3 style={{ fontSize: '19px', fontWeight: '800', margin: '0 0 8px 0', color: '#0F172A' }}>
              Querying Bank Server...
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '320px', margin: 0, lineHeight: 1.5 }}>
              Connecting directly to Ethio Telecom / Commercial Bank of Ethiopia to validate transaction slip authenticity.
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
          {(() => {
            const isDup = Boolean(
              verifiedResult.isDuplicate ||
              verifiedResult.errorMessage?.toLowerCase().includes('duplicate') ||
              verifiedResult.errorMessage?.toLowerCase().includes('already used')
            )

            const isRecvMismatch = Boolean(
              verifiedResult.isReceiverMatched === false ||
              verifiedResult.errorMessage?.toLowerCase().includes('receiver mismatch')
            )

            const selectedOrderObj = openOrders.find(o => o.id === selectedOrderId)
            const targetBill = selectedOrderObj?.total ?? (expectedAmount ? parseFloat(expectedAmount) : null)
            const isUnderpaid = Boolean(
              verifiedResult.isUnderpaid ||
              (typeof verifiedResult.amount === 'number' && targetBill !== null && !isNaN(targetBill) && targetBill > 0 && verifiedResult.amount < targetBill - 0.5)
            )
            const shortAmt = isUnderpaid && targetBill !== null && typeof verifiedResult.amount === 'number'
              ? Math.max(0, targetBill - verifiedResult.amount)
              : (verifiedResult.shortAmount || 0)

            const isGatewayDelay = Boolean(
              !verifiedResult.success &&
              !isDup &&
              !isRecvMismatch &&
              !isUnderpaid &&
              (verifiedResult.isTimeout || verifiedResult.status === 'PENDING')
            )

            const borderColor = (isDup || isRecvMismatch || isUnderpaid)
              ? '#DC2626'
              : isGatewayDelay
                ? '#D97706'
                : verifiedResult.success
                  ? '#059669'
                  : '#DC2626'

            return (
              <div style={{
                background: '#FFFFFF',
                border: `2px solid ${borderColor}`,
                borderRadius: '20px',
                padding: '24px 20px',
                boxShadow: (isDup || isRecvMismatch || isUnderpaid)
                  ? '0 10px 30px rgba(220,38,38,0.12)'
                  : isGatewayDelay
                    ? '0 10px 30px rgba(217,119,6,0.12)'
                    : verifiedResult.success
                      ? '0 10px 30px rgba(5,150,105,0.12)'
                      : '0 10px 30px rgba(220,38,38,0.08)',
                position: 'relative'
              }}>
                {/* Result Status Banner */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: (isDup || isRecvMismatch || isUnderpaid)
                      ? '#FEF2F2'
                      : isGatewayDelay
                        ? '#FFFBEB'
                        : verifiedResult.success
                          ? '#ECFDF5'
                          : '#FEF2F2',
                    border: `1.5px solid ${(isDup || isRecvMismatch || isUnderpaid) ? '#FECACA' : isGatewayDelay ? '#FDE68A' : verifiedResult.success ? '#A7F3D0' : '#FECACA'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isUnderpaid ? (
                      <AlertTriangle size={28} color="#DC2626" />
                    ) : (isDup || isRecvMismatch) ? (
                      <XCircle size={28} color="#DC2626" />
                    ) : isGatewayDelay ? (
                      <AlertTriangle size={28} color="#D97706" />
                    ) : verifiedResult.success ? (
                      <CheckCircle2 size={28} color="#059669" />
                    ) : (
                      <XCircle size={28} color="#DC2626" />
                    )}
                  </div>
                  <div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: (isDup || isRecvMismatch || isUnderpaid)
                        ? '#DC2626'
                        : isGatewayDelay
                          ? '#D97706'
                          : verifiedResult.success
                            ? '#059669'
                            : '#DC2626'
                    }}>
                      {isUnderpaid
                        ? '⚠️ SHORT PAYMENT — AMOUNT TOO LOW'
                        : isDup
                          ? '🚨 DUPLICATE / REUSE DETECTED'
                          : isRecvMismatch
                            ? '🚨 WRONG RECEIVER ACCOUNT'
                            : isGatewayDelay
                              ? '⏳ GATEWAY DELAY / CHECK DIRECT SLIP'
                              : verifiedResult.success
                                ? 'Official Bank Verified'
                                : 'Verification Unsuccessful'}
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#0F172A', margin: '3px 0 0 0', letterSpacing: '-0.02em' }}>
                      {isUnderpaid
                        ? 'Amount Too Low — Not Attached'
                        : isDup
                          ? 'Already Used Receipt!'
                          : isRecvMismatch
                            ? 'Not Credited to Your Account!'
                            : isGatewayDelay
                              ? 'Ref Decoded — Tap Official Slip'
                              : verifiedResult.success
                                ? 'Legitimate Payment'
                                : 'Unconfirmed / Invalid'}
                    </h2>
                  </div>
                </div>

                {/* 1. DUPLICATE ERROR WARNING */}
                {isDup && (
                  <div style={{
                    background: '#FEF2F2',
                    border: '1.5px solid #F87171',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '18px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991B1B', fontWeight: '800', fontSize: '14px' }}>
                      <AlertTriangle size={20} color="#DC2626" />
                      <span>DO NOT ACCEPT — RECEIPT ALREADY USED!</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#7F1D1D', marginTop: '6px', lineHeight: 1.5 }}>
                      {verifiedResult.errorMessage || `This reference code (${verifiedResult.reference}) has ALREADY been used for another order or payment. One receipt cannot be used twice!`}
                    </div>
                    <div style={{ marginTop: '8px', padding: '8px 10px', background: '#FEE2E2', borderRadius: '6px', fontSize: '12px', color: '#991B1B', fontWeight: '700' }}>
                      🛑 <b>Action:</b> Ask customer for today's new transfer confirmation.
                    </div>
                  </div>
                )}

                {/* 2. RECEIVER MISMATCH WARNING */}
                {isRecvMismatch && (
                  <div style={{
                    background: '#FEF2F2',
                    border: '1.5px solid #F87171',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '18px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991B1B', fontWeight: '800', fontSize: '14px' }}>
                      <AlertTriangle size={20} color="#DC2626" />
                      <span>MONEY SENT TO WRONG PERSON / ACCOUNT!</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#7F1D1D', marginTop: '6px', lineHeight: 1.5 }}>
                      {verifiedResult.errorMessage || 'Payment was credited to someone else, NOT your official business account!'}
                    </div>
                    {verifiedResult.receiverName && (
                      <div style={{ marginTop: '8px', fontSize: '13px', color: '#991B1B' }}>
                        Money was credited to: <b style={{ textDecoration: 'underline' }}>{verifiedResult.receiverName}</b> ({verifiedResult.receiverAccount || 'other account'})
                      </div>
                    )}
                    <div style={{ marginTop: '8px', padding: '8px 10px', background: '#FEE2E2', borderRadius: '6px', fontSize: '12px', color: '#991B1B', fontWeight: '700' }}>
                      🛑 <b>Do NOT serve order:</b> The business did NOT receive the money.
                    </div>
                  </div>
                )}

                {/* 3. UNDERPAID WARNING */}
                {isUnderpaid && (
                  <div style={{
                    background: '#FEF2F2',
                    border: '1.5px solid #F87171',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '18px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991B1B', fontWeight: '800', fontSize: '14px' }}>
                      <AlertTriangle size={20} color="#DC2626" />
                      <span>⚠️ AMOUNT IS TOO LOW — RECEIPT NOT ATTACHED!</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#7F1D1D', marginTop: '6px', lineHeight: 1.5 }}>
                      Customer only paid <b>{formatMoney(verifiedResult.amount || 0)}</b>, but the order bill is <b>{formatMoney(targetBill || 0)}</b>.
                    </div>
                    <div style={{
                      marginTop: '10px',
                      padding: '10px 12px',
                      background: '#DC2626',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#FFFFFF',
                      fontWeight: '800',
                      textAlign: 'center'
                    }}>
                      🚨 SHORT BY {formatMoney(shortAmt)}! RECEIPT NOT ATTACHED.
                    </div>
                  </div>
                )}

                {/* Amount Display */}
                {typeof verifiedResult.amount === 'number' && (
                  <div style={{
                    background: isUnderpaid ? '#FEF2F2' : '#F8FAFC',
                    border: `1.5px solid ${isUnderpaid ? '#FCA5A5' : '#E2E8F0'}`,
                    borderRadius: '14px',
                    padding: '18px',
                    textAlign: 'center',
                    marginBottom: '20px'
                  }}>
                    <div style={{ fontSize: '11px', color: isUnderpaid ? '#991B1B' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>
                      {isUnderpaid ? '⚠️ Verified Amount Paid (SHORT PAYMENT)' : 'Verified Amount Paid'}
                    </div>
                    <div style={{
                      fontSize: '34px',
                      fontWeight: '900',
                      color: isUnderpaid ? '#DC2626' : '#059669',
                      fontVariantNumeric: 'tabular-nums',
                      marginTop: '4px',
                      letterSpacing: '-0.02em'
                    }}>
                      {formatMoney(verifiedResult.amount)}
                    </div>
                    {isUnderpaid && targetBill !== null && (
                      <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '6px', fontWeight: '700' }}>
                        Bill Total: {formatMoney(targetBill)} (Short: -{formatMoney(shortAmt)})
                      </div>
                    )}
                  </div>
                )}

                {/* Details List */}
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  fontSize: '13px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748B' }}>Provider:</span>
                    <b style={{ color: '#0F172A' }}>{verifiedResult.provider}</b>
                  </div>

                  {verifiedResult.receiverName && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                      <span style={{ color: '#64748B' }}>Credited Party:</span>
                      <b style={{
                        color: isRecvMismatch ? '#DC2626' : '#059669',
                        fontSize: '13px',
                        background: isRecvMismatch ? '#FEE2E2' : 'transparent',
                        padding: isRecvMismatch ? '2px 6px' : 0,
                        borderRadius: '4px'
                      }}>
                        {verifiedResult.receiverName}
                      </b>
                    </div>
                  )}

                  {verifiedResult.payerName && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                      <span style={{ color: '#64748B' }}>Payer:</span>
                      <b style={{ color: '#0F172A' }}>{verifiedResult.payerName}</b>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748B' }}>Reference Code:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <code style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '13px', color: '#0F172A' }}>
                        {verifiedResult.reference}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyRef(verifiedResult.reference)}
                        style={{
                          background: '#E2E8F0',
                          border: 'none',
                          color: '#475569',
                          borderRadius: '6px',
                          padding: '4px 6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Copy Reference"
                      >
                        {copiedRef ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  {verifiedResult.dateTime && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748B' }}>Date & Time:</span>
                      <span style={{ color: '#0F172A', fontWeight: '600' }}>{verifiedResult.dateTime}</span>
                    </div>
                  )}

                  {verifiedResult.reference && (verifiedResult.reference.startsWith('http') || verifiedResult.provider !== 'UNKNOWN') && (
                    <a
                      href={
                        verifiedResult.reference.startsWith('http')
                          ? verifiedResult.reference
                          : (verifiedResult.provider === 'TELEBIRR'
                            ? `https://transactioninfo.ethiotelecom.et/receipt/${verifiedResult.reference}`
                            : (verifiedResult.reference.startsWith('v2-')
                              ? `https://mbreciept.cbe.com.et/${verifiedResult.reference}`
                              : `https://apps.cbe.com.et:100/?id=${verifiedResult.reference}`))
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: (verifiedResult.isTimeout || verifiedResult.status === 'PENDING') ? '#FEF3C7' : '#FFFFFF',
                        border: `1.5px solid ${(verifiedResult.isTimeout || verifiedResult.status === 'PENDING') ? '#F59E0B' : '#CBD5E1'}`,
                        color: (verifiedResult.isTimeout || verifiedResult.status === 'PENDING') ? '#92400E' : '#0F172A',
                        textDecoration: 'none',
                        fontSize: '12px',
                        fontWeight: '800',
                        marginTop: '6px'
                      }}
                    >
                      <ExternalLink size={15} color={(verifiedResult.isTimeout || verifiedResult.status === 'PENDING') ? '#B45309' : '#B48A1E'} />
                      <span>Open Official {verifiedResult.provider} Slip in Browser</span>
                    </a>
                  )}

                  {/* ⚡ Option B & Gateway Delay Fallback: 1-Tap Slip Approval & Re-check */}
                  {(verifiedResult.isTimeout || verifiedResult.status === 'PENDING') && !verifiedResult.isDuplicate && verifiedResult.isReceiverMatched !== false && (
                    <div style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px dashed #FCD34D',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ fontSize: '11px', color: '#92400E', fontWeight: '700', lineHeight: 1.4 }}>
                        💡 <b>Gateway Lag Workaround:</b> Once you glance at the customer's phone or official slip:
                      </div>

                      {selectedOrderId ? (
                        <button
                          type="button"
                          disabled={isLinkingOrder}
                          onClick={() => {
                            handleLinkToOrder(selectedOrderId, true)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '12px 16px',
                            borderRadius: '10px',
                            background: '#059669',
                            color: '#FFFFFF',
                            border: 'none',
                            fontSize: '13px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(5,150,105,0.25)'
                          }}
                        >
                          <CheckCircle2 size={18} color="#FFFFFF" />
                          <span>{isLinkingOrder ? 'Sending to POS...' : '⚡ Slip Verified — Attach & Send to Cashier POS'}</span>
                        </button>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#B45309', background: '#FEF3C7', padding: '8px 10px', borderRadius: '8px', fontWeight: '700' }}>
                          Select an open table above to attach this payment directly.
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          verifyReference(verifiedResult.reference, verifiedResult.provider as any)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: '#F1F5F9',
                          color: '#334155',
                          border: '1.5px solid #CBD5E1',
                          fontSize: '12px',
                          fontWeight: '800',
                          cursor: 'pointer'
                        }}
                      >
                        <RefreshCw size={14} color="#64748B" />
                        <span>Re-check {verifiedResult.provider === 'CBE' ? 'CBE' : (verifiedResult.provider === 'TELEBIRR' ? 'Ethio Telecom' : 'Bank')} Gateway Now</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

            {/* Cashier Link Action */}
            {verifiedResult.success && (
              <div style={{
                background: '#ECFDF5',
                border: '1.5px solid #A7F3D0',
                borderRadius: '14px',
                padding: '16px'
              }}>
                {linkedSuccessMessage ? (
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: '#065F46',
                      fontWeight: '800',
                      fontSize: '13px',
                      marginBottom: '8px'
                    }}>
                      <CheckCircle2 size={20} color="#059669" />
                      <span>{linkedSuccessMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinkedSuccessMessage(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#059669',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0
                      }}
                    >
                      Need to switch to another table? Tap here
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', color: '#047857', marginBottom: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      ⚡ Confirm & Send to Cashier POS:
                    </div>

                    {(() => {
                      const target = openOrders.find(o => o.id === selectedOrderId)
                      const scannedAmt = verifiedResult.amount
                      const targetAmt = target?.total
                      const diff = (typeof scannedAmt === 'number' && typeof targetAmt === 'number') ? scannedAmt - targetAmt : 0
                      const isPartial = typeof scannedAmt === 'number' && typeof targetAmt === 'number' && diff < -0.5
                      const isOverpaid = typeof scannedAmt === 'number' && typeof targetAmt === 'number' && diff > 0.5

                      const otherMatch = (typeof scannedAmt === 'number')
                        ? openOrders.find(o => o.id !== selectedOrderId && Math.abs(o.total - scannedAmt) < 0.5)
                        : null

                      return (
                        <div>
                          {otherMatch && (
                            <div style={{
                              background: '#FFFBEB',
                              border: '1px solid #FCD34D',
                              borderRadius: '8px',
                              padding: '10px 12px',
                              marginBottom: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '10px'
                            }}>
                              <div>
                                <div style={{ fontSize: '11px', color: '#B45309', fontWeight: '800' }}>
                                  💡 MATCHES ANOTHER TABLE:
                                </div>
                                <div style={{ fontSize: '13px', color: '#0F172A', fontWeight: '700' }}>
                                  {otherMatch.displayTitle} ({formatMoney(otherMatch.total)})
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={isLinkingOrder}
                                onClick={() => {
                                  handleSelectOrder(otherMatch)
                                  handleLinkToOrder(otherMatch.id)
                                }}
                                style={{
                                  padding: '7px 12px',
                                  borderRadius: '6px',
                                  background: '#059669',
                                  color: '#FFFFFF',
                                  fontWeight: '700',
                                  fontSize: '12px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                Switch & Send
                              </button>
                            </div>
                          )}

                          {target && isOverpaid && (
                            <div style={{
                              background: '#F0FDF4',
                              border: '1px solid #BBF7D0',
                              borderRadius: '8px',
                              padding: '10px 12px',
                              marginBottom: '12px',
                              color: '#065F46',
                              fontSize: '12px'
                            }}>
                              <b>🟢 Extra Amount / Tip:</b> Customer paid {formatMoney(scannedAmt)} for {formatMoney(targetAmt)} bill.
                              <div style={{ marginTop: '3px', fontWeight: '700', color: '#059669' }}>
                                Extra +{formatMoney(diff)} recorded as Tip.
                              </div>
                            </div>
                          )}

                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '12px', color: '#475569', fontWeight: '600' }}>
                                {target ? 'Assigned Target Table:' : 'Select which table to attach:'}
                              </span>
                              {target && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectOrder(null)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#B45309',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    padding: 0
                                  }}
                                >
                                  Clear Selection
                                </button>
                              )}
                            </div>
                            <select
                              value={selectedOrderId || ''}
                              onChange={e => {
                                const chosen = openOrders.find(o => o.id === e.target.value) || null
                                handleSelectOrder(chosen)
                              }}
                              style={{
                                width: '100%',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                color: '#0F172A',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: '600',
                                outline: 'none'
                              }}
                            >
                              <option value="">-- Choose or Switch Table / Order --</option>
                              {openOrders.map(o => (
                                <option key={o.id} value={o.id}>
                                  {o.displayTitle} — {formatMoney(o.total)} ({o.waiterName})
                                </option>
                              ))}
                            </select>
                          </div>

                          {selectedOrderId ? (
                            isPartial ? (
                              <div style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '10px',
                                background: '#FEE2E2',
                                border: '1.5px solid #F87171',
                                color: '#991B1B',
                                textAlign: 'center',
                                fontWeight: '800',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}>
                                <AlertTriangle size={18} color="#DC2626" />
                                <span>⛔ ATTACHMENT BLOCKED: Amount is low (-{formatMoney(Math.abs(diff))})</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isLinkingOrder}
                                onClick={() => handleLinkToOrder(selectedOrderId)}
                                style={{
                                  width: '100%',
                                  padding: '12px',
                                  borderRadius: '10px',
                                  border: 'none',
                                  background: '#059669',
                                  color: '#FFFFFF',
                                  fontWeight: '800',
                                  fontSize: '14px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  boxShadow: '0 4px 12px rgba(5,150,105,0.25)'
                                }}
                              >
                                {isLinkingOrder ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                <span>
                                  {isOverpaid
                                    ? `Attach Payment (+Tip) to ${target?.displayTitle || 'Table'}`
                                    : `Confirm & Send to Cashier for ${target?.displayTitle || 'Table'}`}
                                </span>
                              </button>
                            )
                          ) : (
                            <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', padding: '6px 0', fontStyle: 'italic' }}>
                              Select a table above to send this payment to the Cashier POS screen.
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Scan Next Action Button */}
            <button
              type="button"
              onClick={resetForNextScan}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '14px',
                border: 'none',
                background: 'linear-gradient(135deg, #D4AF37 0%, #B48A1E 100%)',
                color: '#FFFFFF',
                fontWeight: '800',
                fontSize: '15px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 6px 18px rgba(180,138,30,0.3)',
                transition: 'all 0.15s ease'
              }}
            >
              <Camera size={18} />
              <span>Scan Next Receipt</span>
            </button>
          </div>
        )}

        {/* --- STATE C: CAMERA QR SCANNER & HERO BUTTON --- */}
        {!verifying && !verifiedResult && mode === 'camera' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

            {/* 1. HERO SCAN CARD (When camera is NOT open yet) */}
            {!isCameraOpen && !cameraActive && !cameraStarting && !cameraError && (
              <div style={{
                width: '100%',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '24px',
                padding: '36px 20px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                {/* Status Pill */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  color: '#059669',
                  fontSize: '11px',
                  fontWeight: '700',
                  marginBottom: '20px'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669' }} />
                  <span>Scanner Ready</span>
                </div>

                {/* Center QR Graphic Emblem */}
                <div style={{
                  width: '88px',
                  height: '88px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                  border: '2px solid #FCD34D',
                  boxShadow: '0 4px 16px rgba(180,138,30,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px'
                }}>
                  <QrCode size={44} color="#B48A1E" />
                </div>

                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
                  Ready to Scan Receipt
                </h2>
                <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '300px', margin: '0 0 28px 0', lineHeight: 1.5 }}>
                  Tap below to launch the camera and scan Telebirr or CBE Birr payment confirmation slips.
                </p>

                {/* THE PRIMARY SCAN BUTTON */}
                <button
                  type="button"
                  onClick={handleStartScan}
                  style={{
                    width: '100%',
                    maxWidth: '340px',
                    minHeight: '54px',
                    padding: '14px 24px',
                    borderRadius: '14px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #D4AF37 0%, #B48A1E 100%)',
                    color: '#FFFFFF',
                    fontWeight: '800',
                    fontSize: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 6px 22px rgba(180,138,30,0.35)',
                    transition: 'all 0.15s ease',
                    touchAction: 'manipulation'
                  }}
                >
                  <Camera size={22} />
                  <span>Tap to Scan QR Code</span>
                </button>

                {/* SECONDARY UPLOAD / SNAP PHOTO BUTTON */}
                <label
                  style={{
                    width: '100%',
                    maxWidth: '340px',
                    marginTop: '12px',
                    minHeight: '44px',
                    padding: '11px 20px',
                    borderRadius: '12px',
                    background: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    touchAction: 'manipulation',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <Zap size={16} color="#B48A1E" />
                  <span>Upload / Snap QR Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileScan}
                    style={{ display: 'none' }}
                  />
                </label>

                {/* Trust Footer */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: '#94A3B8',
                  marginTop: '24px'
                }}>
                  <ShieldCheck size={14} color="#059669" />
                  <span>Bank server validated · Anti-fraud protection</span>
                </div>
              </div>
            )}

            {/* 2. CAMERA VIEWFINDER (When camera is active or starting) */}
            <div style={{
              display: (isCameraOpen || cameraActive || cameraStarting || cameraError) ? 'flex' : 'none',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%'
            }}>
              <div style={{
                width: '100%',
                maxWidth: '440px',
                height: 'min(50vh, 380px)',
                background: '#000000',
                borderRadius: '20px',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                border: '2px solid #B48A1E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box'
              }}>
                {/* Close camera button inside viewfinder */}
                <button
                  type="button"
                  onClick={handleStopScan}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    zIndex: 30,
                    background: 'rgba(15,23,42,0.85)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#FFFFFF',
                    borderRadius: '20px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    touchAction: 'manipulation'
                  }}
                >
                  <X size={14} />
                  <span>Close Camera</span>
                </button>

                {/* html5-qrcode video element mounts here */}
                <div id={scannerContainerId} style={{ width: '100%', height: '100%' }} />

                {/* Viewfinder Overlay Targeting Reticle */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 'min(76%, 260px)',
                  height: 'min(76%, 260px)',
                  border: '1.5px solid rgba(212,175,55,0.6)',
                  borderRadius: '20px',
                  pointerEvents: 'none',
                  boxShadow: '0 0 24px rgba(212,175,55,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10
                }}>
                  <div className="kogna-laser-line" />
                  {/* 4 Corner Targeting Accents */}
                  <div style={{ position: 'absolute', top: -2, left: -2, width: 22, height: 22, borderTop: '3.5px solid #D4AF37', borderLeft: '3.5px solid #D4AF37', borderTopLeftRadius: 18 }} />
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 22, height: 22, borderTop: '3.5px solid #D4AF37', borderRight: '3.5px solid #D4AF37', borderTopRightRadius: 18 }} />
                  <div style={{ position: 'absolute', bottom: -2, left: -2, width: 22, height: 22, borderBottom: '3.5px solid #D4AF37', borderLeft: '3.5px solid #D4AF37', borderBottomLeftRadius: 18 }} />
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderBottom: '3.5px solid #D4AF37', borderRight: '3.5px solid #D4AF37', borderBottomRightRadius: 18 }} />
                </div>

                {cameraStarting && !cameraError && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    background: 'rgba(255,255,255,0.92)',
                    zIndex: 15,
                    pointerEvents: 'none'
                  }}>
                    <RefreshCw size={32} className="animate-spin" color="#B48A1E" />
                    <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: '700' }}>
                      Accessing camera stream...
                    </span>
                  </div>
                )}

                {cameraError && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: '#FFFFFF',
                    padding: '24px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    zIndex: 20
                  }}>
                    <CameraOff size={38} color="#DC2626" style={{ marginBottom: '12px' }} />
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', marginBottom: '6px' }}>
                      Camera Unavailable
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '18px', lineHeight: 1.5, maxWidth: '290px' }}>
                      {cameraError}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '250px' }}>
                      <button
                        type="button"
                        onClick={() => startScanner(facingMode)}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '10px',
                          background: 'linear-gradient(135deg, #D4AF37 0%, #B48A1E 100%)',
                          border: 'none',
                          color: '#FFFFFF',
                          fontSize: '13px',
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

                      <label
                        style={{
                          padding: '10px 16px',
                          borderRadius: '10px',
                          background: '#F8FAFC',
                          border: '1px solid #CBD5E1',
                          color: '#334155',
                          fontSize: '13px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Camera size={14} color="#B48A1E" />
                        <span>Snap / Upload QR Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileScan}
                          style={{ display: 'none' }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={handleStopScan}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          background: 'transparent',
                          border: 'none',
                          color: '#64748B',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Back to Ready Screen
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Camera Controls & Secondary Actions under viewfinder */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '440px', marginTop: '14px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', fontWeight: '700' }}>
                    <Zap size={15} color="#B48A1E" />
                    <span>Point rear camera at Telebirr or CBE QR</span>
                  </div>
                </div>

                {/* Snap Photo Fallback */}
                <label
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: '#FFFBEB',
                    border: '1px solid #FCD34D',
                    color: '#92400E',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Camera size={16} color="#B48A1E" />
                  <span>Snap Photo / Upload QR Screenshot</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileScan}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
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
                padding: '10px 16px',
                background: '#FFFBEB',
                border: '1px solid #FCD34D',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: '#92400E',
                fontWeight: '600'
              }}>
                <RefreshCw size={15} className="animate-spin" />
                <span>Reading QR code from photo...</span>
              </div>
            )}

            {/* File Scan Error Message */}
            {fileError && (
              <div style={{
                marginTop: '12px',
                padding: '12px 14px',
                background: '#FEF2F2',
                border: '1px solid #F87171',
                borderRadius: '10px',
                fontSize: '13px',
                color: '#991B1B',
                lineHeight: 1.4
              }}>
                {fileError}
              </div>
            )}
          </div>
        )}

        {/* --- STATE D: MANUAL REFERENCE CODE ENTRY --- */}
        {!verifying && !verifiedResult && mode === 'manual' && (
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
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
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    color: '#0F172A',
                    outline: 'none',
                    fontFamily: 'monospace',
                    fontWeight: '600'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Bank Provider
                  </label>
                  <select
                    value={manualProvider}
                    onChange={e => setManualProvider(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '11px 12px',
                      fontSize: '13px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      background: '#F8FAFC',
                      color: '#0F172A',
                      outline: 'none',
                      fontWeight: '600'
                    }}
                  >
                    <option value="AUTO">Auto Detect</option>
                    <option value="TELEBIRR">Telebirr</option>
                    <option value="CBE">CBE Birr / CBE</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
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
                      padding: '11px 12px',
                      fontSize: '13px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      background: '#F8FAFC',
                      color: '#0F172A',
                      outline: 'none',
                      fontWeight: '600'
                    }}
                  />
                </div>
              </div>

              {manualProvider === 'CBE' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
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
                      padding: '11px 12px',
                      fontSize: '13px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      background: '#F8FAFC',
                      color: '#0F172A',
                      outline: 'none',
                      fontFamily: 'monospace',
                      fontWeight: '600'
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
                borderRadius: '14px',
                border: 'none',
                background: manualCode.trim() ? 'linear-gradient(135deg, #D4AF37 0%, #B48A1E 100%)' : '#E2E8F0',
                color: manualCode.trim() ? '#FFFFFF' : '#94A3B8',
                fontWeight: '800',
                fontSize: '15px',
                cursor: manualCode.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: manualCode.trim() ? '0 6px 18px rgba(180,138,30,0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <ShieldCheck size={18} />
              <span>Verify Transaction</span>
            </button>
          </form>
        )}
      </main>

      {/* 4. Bottom Collapsible Shift History Drawer (Light Theme) */}
      <footer style={{
        borderTop: '1px solid #E2E8F0',
        background: '#FFFFFF',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.02)',
        width: '100%',
        boxSizing: 'border-box',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))'
      }}>
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            color: '#475569',
            fontSize: '13px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} color="#B48A1E" />
            <span>Recent Verified Scans ({history.length})</span>
          </div>
          {showHistory ? <ChevronDown size={16} color="#64748B" /> : <ChevronUp size={16} color="#64748B" />}
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
              <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: '13px', fontStyle: 'italic' }}>
                No receipts scanned in this session yet.
              </div>
            ) : history.map(item => (
              <div
                key={item.id}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px'
                }}
              >
                <div>
                  <div style={{ fontWeight: '700', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.success ? '#059669' : '#DC2626' }} />
                    <span>{item.payerName || item.reference}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                    {item.provider} · {item.timestamp}
                  </div>
                </div>
                <b style={{ color: item.success ? '#059669' : '#DC2626', fontVariantNumeric: 'tabular-nums', fontWeight: '800' }}>
                  {typeof item.amount === 'number' ? formatMoney(item.amount) : (item.success ? 'OK' : 'FAIL')}
                </b>
              </div>
            ))}
          </div>
        )}
      </footer>

      {/* App Install & APK Download Modal */}
      {showAppModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            position: 'relative'
          }}>
            <button
              type="button"
              onClick={() => setShowAppModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748B'
              }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                border: '1px solid #FCD34D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#B48A1E'
              }}>
                <Smartphone size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0F172A' }}>
                  Use as a Dedicated App
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                  Choose your preferred installation method:
                </p>
              </div>
            </div>

            {/* Option 1: Native Android APK */}
            <div style={{
              background: '#F8FAFC',
              border: '1.5px solid #E2E8F0',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '800', color: '#0F172A' }}>
                  Android Native App (APK)
                </span>
                <span style={{ fontSize: '10px', fontWeight: '800', background: '#ECFDF5', color: '#059669', padding: '2px 6px', borderRadius: '4px', border: '1px solid #A7F3D0' }}>
                  ⚡ Zero-Lag
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                Direct on-device connection inside Ethiopia. Fastest verification, no gateway timeouts, full screen without browser bars.
              </p>
              <a
                href="https://github.com/dsaccn/FBC/releases/latest/download/KognaVerifier.apk"
                download="KognaVerifier.apk"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  color: '#FFFFFF',
                  padding: '11px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: '800',
                  textDecoration: 'none',
                  boxShadow: '0 4px 12px rgba(5,150,105,0.25)'
                }}
              >
                <Download size={16} />
                <span>Download APK (Recommended)</span>
              </a>
            </div>

            {/* Option 2: Add to Home Screen (PWA) */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '14px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', marginBottom: '4px' }}>
                Add to Home Screen (Web App)
              </div>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                Install directly from your browser without downloading APK files:
              </p>
              {deferredPrompt ? (
                <button
                  type="button"
                  onClick={async () => {
                    deferredPrompt.prompt()
                    const c = await deferredPrompt.userChoice
                    if (c.outcome === 'accepted') setIsInstalledApp(true)
                    setDeferredPrompt(null)
                    setShowAppModal(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#1E293B',
                    color: '#F8FAFC',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  📲 Install to Home Screen Now
                </button>
              ) : (
                <div style={{ fontSize: '11px', color: '#475569', background: '#F1F5F9', padding: '8px 10px', borderRadius: '6px' }}>
                  Tap the browser menu <b>⋮</b> (or Share icon in Safari) &rarr; select <b>"Install App"</b> or <b>"Add to Home screen"</b>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
