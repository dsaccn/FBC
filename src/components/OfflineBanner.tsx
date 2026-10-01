'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { WifiOff, Wifi, RefreshCw, CheckCircle, CloudDownload } from 'lucide-react'

type SyncState = 'online-synced' | 'online-syncing' | 'online-pending' | 'offline'

export default function OfflineBanner() {
  const [mounted, setMounted] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('online-synced')
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [lastPulled, setLastPulled] = useState<string | null>(null)
  const [pulledCount, setPulledCount] = useState(0)
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pullIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), 5000)
  }, [])

  const fetchPendingCount = useCallback(async (): Promise<number> => {
    // Only fetch from server when online — local SQLite count via the API
    if (!navigator.onLine) return 0
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' })
      if (!res.ok) return 0
      const data = await res.json()
      return data.pendingCount ?? 0
    } catch {
      return 0
    }
  }, [])

  /** Pull cloud-native orders down to local, refresh UI if anything new arrived */
  const pullFromCloud = useCallback(async () => {
    if (!navigator.onLine) return
    try {
      const res = await fetch('/api/sync?pull=1', { method: 'POST', cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const newOrders = data.pulled?.orders ?? 0
      const newItems = data.pulled?.orderItems ?? 0
      const total = newOrders + newItems

      // Always notify pages to refresh after a successful pull so table statuses
      // stay in sync even when no new orders arrived (e.g. a table became free).
      window.dispatchEvent(new CustomEvent('cloud-pull-complete', { detail: { newOrders } }))

      if (total > 0) {
        setPulledCount(total)
        setLastPulled(new Date().toLocaleTimeString())
        setVisible(true)
        if (hideTimer.current) clearTimeout(hideTimer.current)
        scheduleHide()
      }
    } catch {
      // Ignore pull failures — non-critical
    }
  }, [scheduleHide])

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return
    if (retryTimer.current) clearTimeout(retryTimer.current)

    setSyncState('online-syncing')
    setVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)

    try {
      const res = await fetch('/api/sync', { method: 'POST', cache: 'no-store' })
      const data = await res.json()

      if (res.ok && data.success !== false) {
        setLastSynced(new Date().toLocaleTimeString())
        setSyncState('online-synced')
        setPendingCount(0)

        // If pull brought new orders, show that info and refresh
        const newOrders = data.pulled?.orders ?? 0
        if (newOrders > 0) {
          setPulledCount(newOrders)
          setLastPulled(new Date().toLocaleTimeString())
          window.dispatchEvent(new CustomEvent('cloud-pull-complete', { detail: { newOrders } }))
        }

        scheduleHide()
        window.dispatchEvent(new CustomEvent('sync-complete'))
      } else {
        // Sync failed — retry silently in 30s
        console.warn('[OfflineBanner] Sync failed, will retry in 30s:', data.error ?? data.errors)
        setSyncState('online-synced')
        scheduleHide()
        retryTimer.current = setTimeout(() => {
          if (navigator.onLine) triggerSync()
        }, 30_000)
      }
    } catch {
      setSyncState('online-synced')
      scheduleHide()
      retryTimer.current = setTimeout(() => {
        if (navigator.onLine) triggerSync()
      }, 30_000)
    }
  }, [scheduleHide])

  const updateStatus = useCallback(async () => {
    const online = navigator.onLine

    if (!online) {
      // Offline — show banner immediately, no network calls needed
      setSyncState('offline')
      setVisible(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      return
    }

    const count = await fetchPendingCount()
    setPendingCount(count)

    if (count > 0) {
      setSyncState('online-pending')
      setVisible(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      triggerSync()
    } else {
      setSyncState('online-synced')
      setVisible(true)
      scheduleHide()
    }
  }, [fetchPendingCount, triggerSync, scheduleHide])

  useEffect(() => {
    setMounted(true)
    setVisible(true)

    // Hook into fetch to detect successful writes and kick off sync
    if (typeof window !== 'undefined' && !(window as any).__fetchHooked) {
      (window as any).__fetchHooked = true
      const originalFetch = window.fetch
      window.fetch = async function(...args) {
        const response = await originalFetch(...args)
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url || ''
        const method = (args[1]?.method ?? 'GET').toUpperCase()

        if (
          response.ok &&
          ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) &&
          (url.includes('/api/orders') ||
           url.includes('/api/payments') ||
           url.includes('/api/cancellations') ||
           url.includes('/api/tables') ||
           url.includes('/api/menu-items') ||
           url.includes('/api/categories') ||
           url.includes('/api/ingredients') ||
           url.includes('/api/inventory') ||
           // All staff control writes: meals, members, menu items, ingredients, recipes
           url.includes('/api/staff'))
        ) {
          window.dispatchEvent(new CustomEvent('db-write-success'))
        }
        return response
      }
    }

    // Initial sync on page load
    if (navigator.onLine) {
      triggerSync()
    } else {
      updateStatus()
    }

    // Poll every 60 seconds to push any pending records
    const pushInterval = setInterval(updateStatus, 60_000)

    // Pull from cloud every 30 seconds so online orders appear locally
    pullIntervalRef.current = setInterval(() => {
      if (navigator.onLine) pullFromCloud()
    }, 30_000)

    const handleOnline = async () => {
      const count = await fetchPendingCount()
      setPendingCount(count)
      setVisible(true)
      if (count > 0) {
        triggerSync()
      } else {
        setSyncState('online-synced')
        scheduleHide()
        // Also pull immediately when coming back online
        pullFromCloud()
      }
    }

    const handleOffline = () => {
      setSyncState('offline')
      setVisible(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }

    const handleWriteSuccess = () => {
      if (navigator.onLine) triggerSync()
      else updateStatus()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('db-write-success', handleWriteSuccess)

    return () => {
      clearInterval(pushInterval)
      if (pullIntervalRef.current) clearInterval(pullIntervalRef.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('db-write-success', handleWriteSuccess)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!mounted) return null
  if (!visible) return null

  const config: Record<SyncState, {
    bg: string; border: string; color: string; icon: React.ReactNode; message: string
  }> = {
    'offline': {
      bg: 'rgba(220, 38, 38, 0.12)',
      border: 'rgba(220, 38, 38, 0.35)',
      color: '#ef4444',
      icon: <WifiOff size={14} />,
      message: pendingCount > 0
        ? `No internet — ${pendingCount} change${pendingCount !== 1 ? 's' : ''} saved locally`
        : 'No internet — working offline',
    },
    'online-pending': {
      bg: 'rgba(217, 119, 6, 0.1)',
      border: 'rgba(217, 119, 6, 0.3)',
      color: '#f59e0b',
      icon: <Wifi size={14} />,
      message: `${pendingCount} unsaved change${pendingCount !== 1 ? 's' : ''} — syncing to cloud…`,
    },
    'online-syncing': {
      bg: 'rgba(67, 56, 202, 0.08)',
      border: 'rgba(67, 56, 202, 0.25)',
      color: '#4338ca',
      icon: <RefreshCw size={14} className="ob-spin" />,
      message: 'Syncing with cloud…',
    },
    'online-synced': {
      bg: pulledCount > 0 ? 'rgba(59, 130, 246, 0.08)' : 'rgba(34, 197, 94, 0.08)',
      border: pulledCount > 0 ? 'rgba(59, 130, 246, 0.25)' : 'rgba(34, 197, 94, 0.25)',
      color: pulledCount > 0 ? '#3b82f6' : '#22c55e',
      icon: pulledCount > 0 ? <CloudDownload size={14} /> : <CheckCircle size={14} />,
      message: pulledCount > 0
        ? `↓ ${pulledCount} new order${pulledCount !== 1 ? 's' : ''} pulled from cloud (${lastPulled})`
        : lastSynced
          ? `✓ Cloud synced at ${lastSynced}`
          : '✓ All data synced to cloud',
    },
  }

  const c = config[syncState]

  return (
    <div
      className="offline-banner"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 9999,
        background: c.bg,
        borderBottom: `1px solid ${c.border}`,
        color: c.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '7px 16px',
        fontSize: '12px',
        fontWeight: '500',
        letterSpacing: '0.3px',
        backdropFilter: 'blur(6px)',
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}
    >
      {c.icon}
      <span>{c.message}</span>
      {syncState === 'online-synced' && (
        <span style={{ marginLeft: '8px', fontSize: '10px', opacity: 0.6 }}>
          (hides in 5s)
        </span>
      )}
    </div>
  )
}
