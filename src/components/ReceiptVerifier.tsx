'use client'

import React, { useState } from 'react'
import { ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, X } from 'lucide-react'

export const DEFAULT_CBE_ACCOUNT = ''

export interface VerifiedReceiptData {
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
  status: string
  errorMessage?: string
}

interface ReceiptVerifierProps {
  method: string // 'Telebirr' | 'CBE' | 'Cash' | etc.
  expectedAmount: number
  onVerified?: (receipt: VerifiedReceiptData) => void
  onClear?: () => void
}

export default function ReceiptVerifier({
  method,
  expectedAmount,
  onVerified,
  onClear,
}: ReceiptVerifierProps) {
  const [refInput, setRefInput] = useState('')
  const [accountInput, setAccountInput] = useState(DEFAULT_CBE_ACCOUNT)
  const [loading, setLoading] = useState(false)
  const [verifiedReceipt, setVerifiedReceipt] = useState<VerifiedReceiptData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [copiedAcc, setCopiedAcc] = useState(false)

  const normalizedMethod = method.toUpperCase()
  const isCbe = normalizedMethod.includes('CBE')
  const isTelebirr = normalizedMethod.includes('TELEBIRR')

  // Only CBE and Telebirr support automated receipt verification
  if (!isCbe && !isTelebirr) return null

  const handleCopyAccount = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (accountInput) {
      navigator.clipboard.writeText(accountInput)
      setCopiedAcc(true)
      setTimeout(() => setCopiedAcc(false), 2000)
    }
  }

  const handleVerify = async () => {
    if (!refInput.trim()) {
      setErrorMsg('Please enter the transaction reference code or receipt URL')
      return
    }

    setLoading(true)
    setErrorMsg('')

    try {
      const res = await fetch('/api/verify-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: isCbe ? 'CBE' : 'TELEBIRR',
          referenceOrUrl: refInput.trim(),
          accountDigits: accountInput.trim() || undefined,
          expectedAmount,
        }),
      })

      const data = await res.json()

      if (res.ok && data.receipt && data.receipt.success) {
        setVerifiedReceipt(data.receipt)
        if (onVerified) onVerified(data.receipt)
      } else {
        const msg = data.receipt?.errorMessage || data.error || 'Receipt could not be verified'
        setErrorMsg(msg)
        setVerifiedReceipt(null)
      }
    } catch {
      setErrorMsg('Network error connecting to verification service')
      setVerifiedReceipt(null)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setVerifiedReceipt(null)
    setErrorMsg('')
    setRefInput('')
    setAccountInput(DEFAULT_CBE_ACCOUNT)
    if (onClear) onClear()
  }

  return (
    <div
      style={{
        marginTop: '12px',
        marginBottom: '16px',
        background: 'rgba(201, 168, 76, 0.04)',
        border: '1px solid rgba(201, 168, 76, 0.25)',
        borderRadius: '10px',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={16} color="var(--gold)" />
          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--gold)' }}>
            Verify Official {isCbe ? 'CBE' : 'Telebirr'} Receipt
          </span>
        </div>
        {verifiedReceipt && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px 6px', fontSize: '11px', height: '22px' }}
            onClick={handleReset}
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {!verifiedReceipt ? (
        <div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
              {isCbe ? 'CBE FT Reference (or full URL)' : 'Telebirr Transaction ID (or full URL)'}
            </label>
            <input
              type="text"
              className="input"
              style={{ width: '100%', fontSize: '12px', height: '32px' }}
              placeholder={isCbe ? 'e.g. FT25211G11JQ' : 'e.g. CHQ0FJ403O'}
              value={refInput}
              onChange={e => setRefInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleVerify() } }}
              disabled={loading}
            />
          </div>

          {errorMsg && (
            <div style={{ fontSize: '11px', color: 'var(--danger-light)', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 10px', borderRadius: '6px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ width: '100%', fontSize: '12px', padding: '6px 10px', borderColor: 'var(--gold)', color: 'var(--gold)' }}
            onClick={handleVerify}
            disabled={loading || !refInput.trim()}
          >
            {loading ? (
              <><RefreshCw size={13} className="animate-spin" /> Verifying with {isCbe ? 'CBE' : 'Telebirr'}...</>
            ) : (
              <><ShieldCheck size={14} /> Verify &amp; Match Amount</>
            )}
          </button>
        </div>
      ) : (
        <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <CheckCircle2 size={16} color="var(--success-light)" />
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--success-light)' }}>
              Official Receipt Verified ({verifiedReceipt.provider})
            </span>
          </div>

          <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px', color: 'var(--text-secondary)' }}>
            {verifiedReceipt.payerName && (
              <div>
                <b style={{ color: 'var(--text-primary)' }}>Payer:</b> {verifiedReceipt.payerName}{' '}
                {verifiedReceipt.payerAccountOrPhone ? `(${verifiedReceipt.payerAccountOrPhone})` : ''}
              </div>
            )}
            {verifiedReceipt.receiverName && (
              <div>
                <b style={{ color: 'var(--text-primary)' }}>Receiver:</b> {verifiedReceipt.receiverName}
                {verifiedReceipt.receiverAccount ? ` (${verifiedReceipt.receiverAccount})` : ''}
              </div>
            )}
            <div>
              <b style={{ color: 'var(--text-primary)' }}>Verified Amount:</b>{' '}
              <span style={{ fontWeight: '700', color: 'var(--gold)' }}>
                {verifiedReceipt.amount ? `${verifiedReceipt.amount.toFixed(2)} ETB` : 'Confirmed'}
              </span>
            </div>
            <div><b style={{ color: 'var(--text-primary)' }}>Ref / Slip ID:</b> {verifiedReceipt.reference}</div>
            {verifiedReceipt.dateTime && (
              <div><b style={{ color: 'var(--text-primary)' }}>Timestamp:</b> {verifiedReceipt.dateTime}</div>
            )}
          </div>

          {typeof verifiedReceipt.amount === 'number' && (
            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(16, 185, 129, 0.3)', fontSize: '11px' }}>
              {Math.abs(verifiedReceipt.amount - expectedAmount) < 0.5 ? (
                <span style={{ color: 'var(--success-light)', fontWeight: '600' }}>
                  ✓ Transferred amount matches order total ({expectedAmount.toFixed(2)} ETB).
                </span>
              ) : verifiedReceipt.amount < expectedAmount ? (
                <span style={{ color: 'var(--danger-light)', fontWeight: '600' }}>
                  ⚠️ Underpaid: Receipt ({verifiedReceipt.amount.toFixed(2)} ETB) is less than order total ({expectedAmount.toFixed(2)} ETB)!
                </span>
              ) : (
                <span style={{ color: 'var(--gold)', fontWeight: '600' }}>
                  ℹ Overpaid: Receipt ({verifiedReceipt.amount.toFixed(2)} ETB) covers total ({expectedAmount.toFixed(2)} ETB) with excess.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
