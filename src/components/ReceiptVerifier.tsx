'use client'

import React, { useState } from 'react'
import { ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, X, ArrowRight } from 'lucide-react'

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
  method: string // 'Telebirr' | 'CBE' | 'Cash' | 'Dashen' | 'Awash' | 'BOA' | 'Hibret' | etc.
  expectedAmount: number
  onVerified?: (receipt: VerifiedReceiptData) => void
  onClear?: () => void
}

// Banks that have a publicly-queryable receipt portal
const PORTAL_BANKS: Record<string, { provider: 'DASHEN' | 'AWASH' | 'BOA'; label: string; urlHint: string; placeholder: string }> = {
  DASHEN: {
    provider: 'DASHEN',
    label: 'Dashen',
    urlHint: 'receipt.dashensuperapp.com',
    placeholder: 'https://receipt.dashensuperapp.com/receipt/...',
  },
  AWASH: {
    provider: 'AWASH',
    label: 'Awash',
    urlHint: 'awashpay.awashbank.com',
    placeholder: 'https://awashpay.awashbank.com:8225/-...',
  },
  BOA: {
    provider: 'BOA',
    label: 'Abyssinia (BOA)',
    urlHint: 'cs.bankofabyssinia.com',
    placeholder: 'https://cs.bankofabyssinia.com/slip/?trx=...',
  },
}

function detectPortalProvider(input: string): 'DASHEN' | 'AWASH' | 'BOA' | null {
  if (/dashensuperapp\.com/i.test(input)) return 'DASHEN'
  if (/awashbank\.com/i.test(input)) return 'AWASH'
  if (/bankofabyssinia\.com/i.test(input)) return 'BOA'
  // BOA native QR payload: "{trxId}\BNK" or "{trxId}|BNK"
  if (/[\\|\/]BNK\b/i.test(input)) return 'BOA'
  return null
}

export default function ReceiptVerifier({
  method,
  expectedAmount,
  onVerified,
  onClear,
}: ReceiptVerifierProps) {
  const [refInput, setRefInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifiedReceipt, setVerifiedReceipt] = useState<VerifiedReceiptData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  // For private banks: which Kogna receiving rail did the customer pay to?
  const [receivingRail, setReceivingRail] = useState<'CBE' | 'TELEBIRR'>('CBE')

  const normalizedMethod = method.toUpperCase()
  const isCash = normalizedMethod.includes('CASH')
  const isCbe = normalizedMethod.includes('CBE')
  const isTelebirr = normalizedMethod.includes('TELEBIRR')

  // Any bank that is NOT a direct Kogna receiving rail is a private (interbank transfer) bank
  const isPrivateBank = !isCash && !isCbe && !isTelebirr

  // Private bank's known portal info (Dashen, Awash, BOA) — null for banks without portals
  const portalBankKey = normalizedMethod.includes('DASHEN') ? 'DASHEN'
    : normalizedMethod.includes('AWASH') ? 'AWASH'
    : (normalizedMethod.includes('BOA') || normalizedMethod.includes('ABYSSINIA')) ? 'BOA'
    : null
  const portalBank = portalBankKey ? PORTAL_BANKS[portalBankKey] : null

  // Don't render anything for Cash payments
  if (isCash) return null

  // Detect if the user pasted a private bank portal URL
  const detectedPortal = detectPortalProvider(refInput)

  // Determine the provider enum to send to the backend
  let effectiveProvider: 'CBE' | 'TELEBIRR' | 'DASHEN' | 'AWASH' | 'BOA'
  if (isCbe) {
    effectiveProvider = 'CBE'
  } else if (isTelebirr) {
    effectiveProvider = 'TELEBIRR'
  } else if (detectedPortal) {
    // User pasted a slip URL from a known bank portal — verify via that portal
    effectiveProvider = detectedPortal
  } else {
    // Private bank interbank transfer → verify on Kogna's receiving rail
    effectiveProvider = receivingRail
  }

  const providerLabel = isCbe ? 'CBE'
    : isTelebirr ? 'Telebirr'
    : detectedPortal ? PORTAL_BANKS[detectedPortal].label
    : receivingRail === 'CBE' ? 'CBE'
    : 'Telebirr'

  const inputLabel = isCbe ? 'CBE FT Reference (or full URL)'
    : isTelebirr ? 'Telebirr Transaction ID (or full URL)'
    : detectedPortal ? `${PORTAL_BANKS[detectedPortal].label} Receipt URL (auto-detected)`
    : receivingRail === 'CBE' ? 'CBE FT Reference from customer\'s slip (e.g. FT25211G11JQ)'
    : 'Telebirr Transaction ID from customer\'s slip (e.g. CHQ0FJ403O)'

  const inputPlaceholder = isCbe ? 'e.g. FT25211G11JQ'
    : isTelebirr ? 'e.g. CHQ0FJ403O'
    : detectedPortal ? PORTAL_BANKS[detectedPortal].placeholder
    : receivingRail === 'CBE' ? 'e.g. FT25211G11JQ or https://mbreciept.cbe.com.et/...'
    : 'e.g. CHQ0FJ403O or https://transactioninfo.ethiotelecom.et/...'

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
          provider: effectiveProvider,
          referenceOrUrl: refInput.trim(),
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
            {isPrivateBank ? `Verify Interbank Transfer (${method})` : `Verify Official ${providerLabel} Receipt`}
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
          {/* Private bank rail selector */}
          {isPrivateBank && !detectedPortal && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                Customer paid from <b style={{ color: 'var(--text-primary)' }}>{method}</b> to Kogna&apos;s:
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setReceivingRail('CBE')}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: receivingRail === 'CBE' ? '1.5px solid #800080' : '1px solid rgba(255,255,255,0.12)',
                    background: receivingRail === 'CBE' ? 'rgba(128,0,128,0.12)' : 'rgba(255,255,255,0.04)',
                    color: receivingRail === 'CBE' ? '#c084fc' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: receivingRail === 'CBE' ? '700' : '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  {receivingRail === 'CBE' && <ArrowRight size={11} />}
                  🏦 CBE Account
                </button>
                <button
                  type="button"
                  onClick={() => setReceivingRail('TELEBIRR')}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: receivingRail === 'TELEBIRR' ? '1.5px solid #0072CE' : '1px solid rgba(255,255,255,0.12)',
                    background: receivingRail === 'TELEBIRR' ? 'rgba(0,114,206,0.12)' : 'rgba(255,255,255,0.04)',
                    color: receivingRail === 'TELEBIRR' ? '#60a5fa' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: receivingRail === 'TELEBIRR' ? '700' : '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  {receivingRail === 'TELEBIRR' && <ArrowRight size={11} />}
                  📱 Telebirr
                </button>
              </div>
            </div>
          )}

          {/* Portal URL hint for banks with slip portals */}
          {isPrivateBank && portalBank && !detectedPortal && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '7px', lineHeight: 1.4 }}>
              Or paste a <b style={{ color: 'var(--text-secondary)' }}>{portalBank.label} receipt URL</b> ({portalBank.urlHint}) to auto-verify from the portal.
            </div>
          )}

          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
              {inputLabel}
            </label>
            <input
              type="text"
              className="input"
              style={{ width: '100%', fontSize: '12px', height: '32px' }}
              placeholder={inputPlaceholder}
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
              <><RefreshCw size={13} className="animate-spin" /> Verifying with {providerLabel}...</>
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
