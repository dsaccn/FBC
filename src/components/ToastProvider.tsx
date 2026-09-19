'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Standalone helper callable anywhere in client components
 * e.g. emitToast('Payment successful!', 'success')
 */
export function emitToast(message: string, type: ToastType = 'info', duration = 3500) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app-toast', {
        detail: { message, type, duration },
      })
    )
  }
}

export const toast = {
  success: (msg: string, dur?: number) => emitToast(msg, 'success', dur),
  error: (msg: string, dur?: number) => emitToast(msg, 'error', dur),
  warning: (msg: string, dur?: number) => emitToast(msg, 'warning', dur),
  info: (msg: string, dur?: number) => emitToast(msg, 'info', dur),
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback to emitToast if used outside Provider
    return {
      showToast: emitToast,
      success: toast.success,
      error: toast.error,
      warning: toast.warning,
      info: toast.info,
    }
  }
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3500) => {
      const id = Math.random().toString(36).substring(2, 9)
      setToasts(prev => [...prev.slice(-3), { id, message, type, duration }]) // keep max 4 toasts

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }
    },
    [removeToast]
  )

  const success = useCallback((msg: string, dur?: number) => showToast(msg, 'success', dur), [showToast])
  const error = useCallback((msg: string, dur?: number) => showToast(msg, 'error', dur), [showToast])
  const warning = useCallback((msg: string, dur?: number) => showToast(msg, 'warning', dur), [showToast])
  const info = useCallback((msg: string, dur?: number) => showToast(msg, 'info', dur), [showToast])

  // Listen to global custom event
  useEffect(() => {
    const handleCustomToast = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && detail.message) {
        showToast(detail.message, detail.type || 'info', detail.duration || 3500)
      }
    }
    window.addEventListener('app-toast', handleCustomToast)
    return () => window.removeEventListener('app-toast', handleCustomToast)
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      {/* Toast Notification Container */}
      <div
        className="toast-container"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
          maxWidth: '92vw',
          width: '380px',
        }}
      >
        {toasts.map(t => {
          const isSuccess = t.type === 'success'
          const isError = t.type === 'error'
          const isWarning = t.type === 'warning'

          const borderColor = isSuccess
            ? 'rgba(16, 185, 129, 0.4)'
            : isError
            ? 'rgba(239, 68, 68, 0.4)'
            : isWarning
            ? 'rgba(245, 158, 11, 0.4)'
            : 'rgba(0, 229, 255, 0.4)'

          const bgColor = isSuccess
            ? 'rgba(6, 40, 30, 0.95)'
            : isError
            ? 'rgba(48, 12, 16, 0.95)'
            : isWarning
            ? 'rgba(40, 26, 6, 0.95)'
            : 'rgba(15, 23, 42, 0.95)'

          const iconColor = isSuccess
            ? '#10B981'
            : isError
            ? '#EF4444'
            : isWarning
            ? '#F59E0B'
            : '#00E5FF'

          return (
            <div
              key={t.id}
              className="toast-item-card"
              style={{
                pointerEvents: 'auto',
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '12px',
                padding: '12px 16px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#F5F0E6',
                animation: 'toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                transformOrigin: 'top right',
              }}
            >
              <div style={{ flexShrink: 0, color: iconColor }}>
                {isSuccess && <CheckCircle2 size={20} />}
                {isError && <AlertCircle size={20} />}
                {isWarning && <AlertTriangle size={20} />}
                {!isSuccess && !isError && !isWarning && <Info size={20} />}
              </div>
              <div style={{ flex: 1, fontSize: '13px', lineHeight: '1.4', fontWeight: 500 }}>
                {t.message}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss toast"
                style={{
                  flexShrink: 0,
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(245, 240, 230, 0.6)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                  transition: 'color 0.15s ease',
                }}
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
