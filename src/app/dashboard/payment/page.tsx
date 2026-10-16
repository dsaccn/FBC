'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Printer, CheckCircle, Bike, ShoppingBag, Zap } from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import ReceiptVerifier from '@/components/ReceiptVerifier'
import { printTicketHtml } from '@/lib/printer'

interface OrderItem { id: string; menuItem: { name: string; price: number; category: { name: string } }; quantity: number; notes?: string; status: string }
interface Order {
  id: string
  table: { number: string; id: string; mergeGroupId?: string | null; mergeGroupLabel?: string | null }
  waiter: { fullName: string }
  orderItems: OrderItem[]
  status: string
  verifiedRef?: string | null
  verifiedProvider?: string | null
  verifiedAmount?: number | null
  verifiedPayer?: string | null
  verifiedReceiver?: string | null
  verifiedAt?: string | null
}

const PAYMENT_METHODS = ['Cash', 'Telebirr', 'CBE']

export default function PaymentPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderId = searchParams.get('orderId')

  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [session, setSession] = useState<{ id: string; fullName: string; role: string } | null>(null)
  const [method, setMethod] = useState('Cash')
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed')
  const [discountValue, setDiscountValue] = useState('')
  const [tipAmount, setTipAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [lastPayment, setLastPayment] = useState<{ amount: number; method: string } | null>(null)
  const [recentPhoneScan, setRecentPhoneScan] = useState<{
    reference: string
    provider: string
    amount?: number
    payerName?: string
    receiverName?: string
    timestamp: string
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const [ordRes, sessRes] = await Promise.all([
        fetch('/api/orders?status=OPEN'),
        fetch('/api/auth/me'),
      ])
      if (ordRes.ok) {
        const ords = await ordRes.json()
        setOrders(ords)
        setSelectedOrder(prev => {
          if (prev) {
            const found = ords.find((o: Order) => o.id === prev.id)
            return found || prev
          }
          if (orderId) {
            const found = ords.find((o: Order) => o.id === orderId)
            return found || null
          }
          return null
        })
      } else {
        toast.error('Failed to load open orders')
      }
      if (sessRes.ok) setSession(await sessRes.json())
    } catch {
      toast.error('Network error loading payments')
    }
  }, [orderId])

  useEffect(() => {
    load()
    // Backup polling every 1.5s
    const interval = setInterval(load, 1500)

    // Instant Millisecond Real-Time Push via Server-Sent Events (SSE)
    let es: EventSource | null = null
    try {
      es = new EventSource('/api/scanner/events')
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'ORDER_VERIFIED') {
            // 1. Instantly update order in orders list in 0 ms!
            setOrders(prev => prev.map(o => {
              if (o.id === payload.orderId) {
                return {
                  ...o,
                  verifiedRef: payload.reference,
                  verifiedProvider: payload.provider,
                  verifiedAmount: payload.amount,
                  verifiedPayer: payload.payerName,
                  verifiedReceiver: payload.receiverName,
                  verifiedAt: payload.timestamp,
                }
              }
              return o
            }))

            // 2. Instantly update selectedOrder if matching
            setSelectedOrder(prev => {
              if (prev && prev.id === payload.orderId) {
                return {
                  ...prev,
                  verifiedRef: payload.reference,
                  verifiedProvider: payload.provider,
                  verifiedAmount: payload.amount,
                  verifiedPayer: payload.payerName,
                  verifiedReceiver: payload.receiverName,
                  verifiedAt: payload.timestamp,
                }
              }
              return prev
            })

            // 3. Auto-select payment method immediately
            if (payload.provider) {
              const p = String(payload.provider).toUpperCase()
              if (p.includes('TELEBIRR')) setMethod('Telebirr')
              else if (p.includes('CBE')) setMethod('CBE')
            }

            // 4. Play audio chime and toast notification
            try {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
              if (AudioContextClass) {
                const ctx = new AudioContextClass()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)
                osc.frequency.setValueAtTime(587.33, ctx.currentTime)
                osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1)
                gain.gain.setValueAtTime(0.2, ctx.currentTime)
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
                osc.start(ctx.currentTime)
                osc.stop(ctx.currentTime + 0.35)
              }
            } catch {}

            toast.success(`⚡ Instant Verification: ${payload.tableNumber ? `Table ${payload.tableNumber}` : 'Order'} (${payload.provider} ${payload.amount ? `${payload.amount} ETB` : ''})`)
          } else if (payload.type === 'RECEIPT_SCANNED') {
            setRecentPhoneScan(payload)
            // Play a soft chime
            try {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
              if (AudioContextClass) {
                const ctx = new AudioContextClass()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)
                osc.frequency.setValueAtTime(659.25, ctx.currentTime) // E5
                gain.gain.setValueAtTime(0.15, ctx.currentTime)
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
                osc.start(ctx.currentTime)
                osc.stop(ctx.currentTime + 0.25)
              }
            } catch {}
            toast.info(`📱 Scanned on Phone: ${payload.provider} ${payload.amount ? `${payload.amount} ETB` : ''} (Ref: ${payload.reference})`)
          } else if (payload.type === 'ORDER_CLEARED') {
            setOrders(prev => prev.map(o => o.id === payload.orderId ? { ...o, verifiedRef: null, verifiedProvider: null, verifiedAmount: null, verifiedPayer: null, verifiedReceiver: null, verifiedAt: null } : o))
            setSelectedOrder(prev => prev && prev.id === payload.orderId ? { ...prev, verifiedRef: null, verifiedProvider: null, verifiedAmount: null, verifiedPayer: null, verifiedReceiver: null, verifiedAt: null } : prev)
          }
        } catch {}
      }
    } catch {}

    return () => {
      clearInterval(interval)
      if (es) es.close()
    }
  }, [load])

  // When an order is selected, if it has already been verified on phone, pre-select that payment method
  useEffect(() => {
    if (selectedOrder?.verifiedProvider) {
      const prov = selectedOrder.verifiedProvider.toUpperCase()
      if (prov.includes('TELEBIRR')) setMethod('Telebirr')
      else if (prov.includes('CBE')) setMethod('CBE')
    }
  }, [selectedOrder?.id, selectedOrder?.verifiedRef, selectedOrder?.verifiedProvider])

  const activeItems = selectedOrder?.orderItems.filter(i => i.status !== 'CANCELLED') || []
  const subtotal = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)

  // Auto-calculate tip when verified amount exceeds order subtotal
  useEffect(() => {
    if (selectedOrder?.verifiedAmount && selectedOrder.verifiedAmount > subtotal && !tipAmount) {
      const extra = (selectedOrder.verifiedAmount - subtotal).toFixed(2)
      setTipAmount(extra)
    }
  }, [selectedOrder?.verifiedAmount, subtotal, tipAmount])

  async function handleLinkRecentScan(orderId: string) {
    if (!recentPhoneScan) return
    try {
      const res = await fetch('/api/scanner/verify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          reference: recentPhoneScan.reference,
          provider: recentPhoneScan.provider,
          amount: recentPhoneScan.amount,
          payerName: recentPhoneScan.payerName,
          receiverName: recentPhoneScan.receiverName,
        }),
      })
      if (res.ok) {
        toast.success('Attached phone scan to order!')
        setRecentPhoneScan(null)
      } else {
        toast.error('Failed to attach phone scan')
      }
    } catch {
      toast.error('Network error attaching scan')
    }
  }
  const discountAmt = discountValue
    ? discountType === 'percentage' ? (subtotal * parseFloat(discountValue)) / 100 : parseFloat(discountValue)
    : 0
  const tipAmt = parseFloat(tipAmount) || 0
  const isDigitalPayment = method === 'Telebirr' || method === 'CBE'
  const total = Math.max(0, subtotal - discountAmt + (isDigitalPayment ? tipAmt : 0))

  // Helper: parse delivery/takeaway or standard table
  const parseOrderInfo = (table: { number: string; mergeGroupId?: string | null; mergeGroupLabel?: string | null }, items?: any[]) => {
    const tableNumber = table.number || ''
    const lower = tableNumber.toLowerCase()
    const isDelivery = lower.startsWith('delivery')
    const isTakeaway = lower.startsWith('takeaway')

    if (!isDelivery && !isTakeaway) {
      const isMerged = Boolean(table.mergeGroupId || table.mergeGroupLabel)
      const displayTitle = table.mergeGroupLabel ? `Table ${table.mergeGroupLabel}` : `Table ${tableNumber}`
      return {
        isSpecial: false,
        type: 'TABLE' as const,
        title: displayTitle,
        boxLabel: table.mergeGroupLabel || tableNumber,
        phone: null,
        credential: table.mergeGroupId || null,
        isMerged,
      }
    }

    const type = isDelivery ? 'DELIVERY' : 'TAKEAWAY'
    let cleanName = tableNumber.replace(/^(Delivery:|Takeaway:)\s*/i, '').replace(/#.*$/, '').trim()
    let extractedPhone = ''
    const phoneMatch = cleanName.match(/\(([^)]+)\)/)
    if (phoneMatch) {
      extractedPhone = phoneMatch[1]
      cleanName = cleanName.replace(/\([^)]+\)/, '').trim()
    }

    if (!cleanName || cleanName.toLowerCase() === 'delivery' || cleanName.toLowerCase() === 'takeaway') {
      cleanName = ''
    }

    if (items && items[0]?.notes) {
      const metaMatch = items[0].notes.match(/\[(.*?)\]/)
      if (metaMatch) {
        const parts = metaMatch[1].split('|').map((s: string) => s.trim())
        for (const part of parts) {
          if (part.startsWith('👤') && !cleanName) cleanName = part.replace('👤', '').trim()
          if (part.startsWith('📞') && !extractedPhone) extractedPhone = part.replace('📞', '').trim()
        }
      }
    }

    return {
      isSpecial: true,
      type,
      title: cleanName || (isDelivery ? 'Delivery Order' : 'Takeaway Order'),
      boxLabel: isDelivery ? '🛵' : '🥡',
      phone: extractedPhone,
      credential: null,
      isMerged: false,
    }
  }

  const selectedInfo = selectedOrder ? parseOrderInfo(selectedOrder.table, selectedOrder.orderItems) : null

  async function handleClearVerification(id: string) {
    if (!confirm('Clear mobile phone payment verification for this order?')) return
    try {
      const res = await fetch(`/api/scanner/verify-order?orderId=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Mobile verification cleared')
        load()
      } else {
        toast.error('Failed to clear verification')
      }
    } catch {
      toast.error('Network error clearing verification')
    }
  }

  async function handlePay() {
    if (!selectedOrder) {
      toast.warning('Please select an order to pay')
      return
    }
    if (!session) {
      toast.error('User session expired. Please log in again.')
      return
    }
    setLoading(true)
    try {
      const notesWithTip = tipAmt > 0 ? (notes ? `${notes} [Tip: ${tipAmt.toFixed(2)} ETB]` : `[Tip: ${tipAmt.toFixed(2)} ETB]`) : notes
      const verifiedTag = selectedOrder.verifiedRef
        ? `[${selectedOrder.verifiedProvider || 'Digital'} Ref: ${selectedOrder.verifiedRef}${selectedOrder.verifiedReceiver ? ` | Credited: ${selectedOrder.verifiedReceiver}` : ''}${selectedOrder.verifiedPayer ? ` | Payer: ${selectedOrder.verifiedPayer}` : ''}]`
        : ''
      const finalNotes = [notesWithTip, verifiedTag].filter(Boolean).join(' ')

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrder.id, cashierId: session.id, amount: total, method, discount: discountAmt, discountType, notes: finalNotes }),
      })
      if (res.ok) {
        setLastPayment({ amount: total, method })
        setPaid(true)
        toast.success(`Payment of ${total.toFixed(2)} ETB (${method}) processed successfully!`)
        setTimeout(() => {
          printReceipt()
        }, 200)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to process payment')
      }
    } catch {
      toast.error('Network error processing payment')
    } finally {
      setLoading(false)
    }
  }

  function printReceipt() {
    if (!selectedOrder) return
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })
    const info = parseOrderInfo(selectedOrder.table, selectedOrder.orderItems)
    const html = `<html>
      <head>
        <title>Receipt</title>
        <style>
          @page { margin: 0; }
          *, *:before, *:after { box-sizing: border-box; }
          body { margin: 0; padding: 10px 15px; font-family: Courier New, monospace; width: 100%; font-size: 13px; color: #000; background: #fff; font-weight: bold; }
          hr { border-top: 1px dashed #000; border-bottom: none; border-left: none; border-right: none; margin: 8px 0; }
        </style>
      </head>
      <body>
      <div style="text-align:center;margin-bottom:10px;">
        <b style="font-size:18px;letter-spacing:2px;">Kogna Coffee</b><br/>
        <span style="font-size:11px;">Addis Ababa, Ethiopia</span><br/>
        <hr/>
        <b>RECEIPT</b>
      </div>
      <div style="margin-bottom:10px;font-size:13px;">
        <b>${info.isSpecial ? (info.type === 'DELIVERY' ? 'Delivery:' : 'Takeaway:') : 'Table:'}</b> ${info.title}${info.credential ? ` [${info.credential}]` : ''}<br/>
        ${info.phone ? `<b>Phone:</b> ${info.phone}<br/>` : ''}
        <b>Waiter:</b> ${selectedOrder.waiter.fullName}<br/>
        <b>Cashier:</b> ${session?.fullName || '-'}<br/>
        <b>Date:</b> ${now}
      </div>
      <hr/>
      ${activeItems.map(i => `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
        <span>${i.quantity}x ${i.menuItem.name}</span>
        <span>${(i.menuItem.price * i.quantity).toFixed(2)} ETB</span>
      </div>`).join('')}
      <hr/>
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${subtotal.toFixed(2)} ETB</span></div>
      ${discountAmt > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Discount</span><span>-${discountAmt.toFixed(2)} ETB</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px;margin-top:4px;">
        <span>TOTAL</span><span>${total.toFixed(2)} ETB</span>
      </div>
      <div style="margin-top:8px;font-size:13px;"><b>Paid via:</b> ${method}</div>
      <hr/>
      <div style="text-align:center;font-size:12px;font-weight:900;color:#000;letter-spacing:1.5px;margin-top:8px;">
        <b>MEBA TECH PRO</b>
      </div>
    </body></html>`
    printTicketHtml(html)
  }

  if (paid) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '500px', margin: '60px auto', textAlign: 'center' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(82,183,136,0.15)', border: '2px solid var(--success-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <CheckCircle size={40} color="var(--success-light)" />
        </div>
        <h2 className="font-cinzel gold-text" style={{ fontSize: '24px', marginBottom: '8px' }}>Payment Complete!</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
          {lastPayment?.amount.toFixed(2)} ETB received via {lastPayment?.method}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '32px' }}>
          {selectedInfo?.isSpecial ? 'Order marked as Paid & Complete.' : 'Table is now marked as Free.'}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn btn-outline" onClick={printReceipt}><Printer size={16} /> Print Receipt</button>
          <button className="btn btn-gold" onClick={() => window.location.href = selectedInfo?.isSpecial ? '/dashboard/delivery' : '/dashboard/tables'}>
            {selectedInfo?.isSpecial ? 'Back to Delivery' : 'Back to Tables'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in mobile-col" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Order Selection */}
      <div style={{ flex: 1, minWidth: '280px', width: '100%' }}>
        <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700', marginBottom: '24px' }}>
          <span className="gold-text">Process Payment</span>
        </h1>

        {!selectedOrder ? (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Select an open order to process payment:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {orders.map(o => {
                const t = o.orderItems.filter(i => i.status !== 'CANCELLED').reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
                const info = parseOrderInfo(o.table, o.orderItems)
                return (
                  <div
                    key={o.id}
                    className="card card-hover"
                    onClick={() => setSelectedOrder(o)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      gap: '14px',
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                      {/* Visual Identifier Box */}
                      <div style={{
                        width: '46px',
                        height: '46px',
                        background: info.isSpecial
                          ? (info.type === 'DELIVERY' ? 'rgba(59,130,246,0.1)' : 'rgba(234,88,12,0.1)')
                          : 'rgba(201,168,76,0.08)',
                        border: info.isSpecial
                          ? (info.type === 'DELIVERY' ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(234,88,12,0.4)')
                          : '1px solid var(--gold-dark)',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Cinzel,serif',
                        fontWeight: '700',
                        fontSize: info.isSpecial ? '20px' : '16px',
                        color: 'var(--gold)',
                        flexShrink: 0
                      }}>
                        {info.boxLabel}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '600', fontSize: '15px' }}>{info.title}</span>
                          {info.isSpecial && (
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: info.type === 'DELIVERY' ? 'rgba(37,99,235,0.08)' : 'rgba(234,88,12,0.08)',
                              color: info.type === 'DELIVERY' ? '#1d4ed8' : '#c2410c',
                              border: `1px solid ${info.type === 'DELIVERY' ? 'rgba(37,99,235,0.25)' : 'rgba(234,88,12,0.25)'}`,
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              {info.type === 'DELIVERY' ? <Bike size={11} /> : <ShoppingBag size={11} />}
                              {info.type === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {info.phone ? <span style={{ color: 'var(--gold)', marginRight: '6px' }}>📞 {info.phone} ·</span> : null}
                          {o.waiter.fullName} · {o.orderItems.length} items
                        </div>
                        {o.verifiedRef && (
                          <div style={{ marginTop: '5px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: 'rgba(16,185,129,0.15)',
                              color: '#10B981',
                              border: '1px solid rgba(16,185,129,0.3)',
                              fontWeight: '700',
                            }}>
                              <CheckCircle size={11} />
                              {o.verifiedProvider || 'Digital'} Verified ({o.verifiedAmount ? `${o.verifiedAmount.toFixed(2)} ETB` : 'Slip'})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--gold)', flexShrink: 0, marginLeft: '12px' }}>
                      {t.toFixed(2)} ETB
                    </div>
                  </div>
                )
              })}
              {orders.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No open orders.</p>}
            </div>
          </div>
        ) : (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  background: selectedInfo?.isSpecial
                    ? (selectedInfo.type === 'DELIVERY' ? 'rgba(59,130,246,0.1)' : 'rgba(234,88,12,0.1)')
                    : 'rgba(201,168,76,0.08)',
                  border: selectedInfo?.isSpecial
                    ? (selectedInfo.type === 'DELIVERY' ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(234,88,12,0.4)')
                    : '1px solid var(--gold-dark)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: selectedInfo?.isSpecial ? '18px' : '15px',
                  fontWeight: '700',
                  color: 'var(--gold)',
                }}>
                  {selectedInfo?.boxLabel}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontWeight: '600', fontSize: '16px', margin: 0 }}>{selectedInfo?.title} — Bill</h3>
                    {selectedInfo?.isMerged && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(201,168,76,0.15)',
                        color: 'var(--gold)',
                        border: '1px solid rgba(201,168,76,0.3)',
                        fontWeight: '600',
                      }}>
                        🔗 Merged Unit {selectedInfo.credential ? `[${selectedInfo.credential}]` : ''}
                      </span>
                    )}
                    {selectedInfo?.isSpecial && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: selectedInfo.type === 'DELIVERY' ? 'rgba(59,130,246,0.15)' : 'rgba(234,88,12,0.15)',
                        color: selectedInfo.type === 'DELIVERY' ? '#60a5fa' : '#fb923c',
                        border: `1px solid ${selectedInfo.type === 'DELIVERY' ? 'rgba(59,130,246,0.3)' : 'rgba(234,88,12,0.3)'}`,
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {selectedInfo.type === 'DELIVERY' ? <Bike size={11} /> : <ShoppingBag size={11} />}
                        {selectedInfo.type === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
                      </span>
                    )}
                  </div>
                  {selectedInfo?.phone && (
                    <div style={{ fontSize: '12px', color: 'var(--gold)', marginTop: '2px' }}>
                      📞 {selectedInfo.phone}
                    </div>
                  )}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedOrder(null)}>Change</button>
            </div>
            {activeItems.map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', borderBottom: '1px solid var(--black-border)' }}>
                <span>{i.quantity}x {i.menuItem.name}{i.notes ? ` (${i.notes})` : ''}</span>
                <span style={{ color: 'var(--gold)' }}>{(i.menuItem.price * i.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span>Subtotal</span><span>{subtotal.toFixed(2)} ETB</span>
            </div>
          </div>
        )}
      </div>

      {/* Payment Panel */}
      {selectedOrder && (
        <div className="mobile-full-w" style={{ width: '340px', maxWidth: '100%', flexShrink: 0 }}>
          <div className="card">
            {/* Live Floating Phone Scan Alert */}
            {recentPhoneScan && (!selectedOrder.verifiedRef || selectedOrder.verifiedRef !== recentPhoneScan.reference) && (
              <div style={{
                marginBottom: '16px',
                background: 'linear-gradient(135deg, rgba(201,168,76,0.18) 0%, rgba(180,138,30,0.08) 100%)',
                border: '1px solid rgba(201,168,76,0.45)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(201,168,76,0.15)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--gold)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <Zap size={14} />
                    <span>Live Phone Scan Detected</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecentPhoneScan(null)}
                    style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                  >
                    Dismiss ✕
                  </button>
                </div>
                <div style={{ fontSize: '13px', color: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><b>{recentPhoneScan.provider}</b>: <code style={{ color: 'var(--gold-light)' }}>{recentPhoneScan.reference}</code></span>
                  <b style={{ color: '#34D399', fontSize: '14px' }}>
                    {recentPhoneScan.amount ? `${recentPhoneScan.amount.toFixed(2)} ETB` : ''}
                  </b>
                </div>
                {recentPhoneScan.receiverName && (
                  <div style={{ fontSize: '11px', color: '#CBD5E1' }}>
                    Credited: <b style={{ color: '#34D399' }}>{recentPhoneScan.receiverName}</b>
                    {recentPhoneScan.payerName && ` · Payer: ${recentPhoneScan.payerName}`}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleLinkRecentScan(selectedOrder.id)}
                  style={{
                    marginTop: '2px',
                    width: '100%',
                    padding: '8px 12px',
                    background: '#10B981',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
                  }}
                >
                  <CheckCircle size={14} />
                  <span>Attach This Scan to {selectedInfo?.title || 'This Order'}</span>
                </button>
              </div>
            )}

            {/* Phone Verified Slip Details Card */}
            {selectedOrder.verifiedRef && (
              <div style={{
                marginBottom: '16px',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(5,150,105,0.06) 100%)',
                border: '1px solid rgba(16,185,129,0.35)',
                borderRadius: '10px',
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: '700', fontSize: '13px' }}>
                    <CheckCircle size={16} />
                    <span>Verified by Phone Scanner</span>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: '#10B981',
                    color: '#FFFFFF'
                  }}>
                    {selectedOrder.verifiedProvider || 'DIGITAL'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '5px', color: '#E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94A3B8' }}>Credited Party (Receiver):</span>
                    <b style={{ color: '#34D399' }}>{selectedOrder.verifiedReceiver || 'Kogna Coffee'}</b>
                  </div>
                  {selectedOrder.verifiedPayer && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94A3B8' }}>Payer:</span>
                      <b>{selectedOrder.verifiedPayer}</b>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94A3B8' }}>Verified Amount:</span>
                    <b style={{ color: '#F1F5F9' }}>{(selectedOrder.verifiedAmount ?? subtotal).toFixed(2)} ETB</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94A3B8' }}>Transaction Ref:</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--gold-light)', fontWeight: '700' }}>{selectedOrder.verifiedRef}</span>
                  </div>

                  {/* Partial or Tip Analysis Banner */}
                  {selectedOrder.verifiedAmount && selectedOrder.verifiedAmount < subtotal && (
                    <div style={{
                      marginTop: '6px',
                      padding: '8px 10px',
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: '6px',
                      color: '#FDE68A',
                      fontSize: '11px',
                      lineHeight: 1.4
                    }}>
                      <b>🟡 Partial Payment:</b> Scanned {(selectedOrder.verifiedAmount).toFixed(2)} ETB of {subtotal.toFixed(2)} ETB bill.
                      <div style={{ marginTop: '2px', fontWeight: '700', color: '#FCD34D' }}>
                        Remaining to collect: {(subtotal - selectedOrder.verifiedAmount).toFixed(2)} ETB (e.g. in Cash)
                      </div>
                    </div>
                  )}
                  {selectedOrder.verifiedAmount && selectedOrder.verifiedAmount > subtotal && (
                    <div style={{
                      marginTop: '6px',
                      padding: '8px 10px',
                      background: 'rgba(16,185,129,0.12)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      borderRadius: '6px',
                      color: '#A7F3D0',
                      fontSize: '11px',
                      lineHeight: 1.4
                    }}>
                      <b>🟢 Extra Payment (Tip):</b> Scanned {(selectedOrder.verifiedAmount).toFixed(2)} ETB for a {subtotal.toFixed(2)} ETB bill.
                      <div style={{ marginTop: '2px', fontWeight: '700', color: '#34D399' }}>
                        Extra +{(selectedOrder.verifiedAmount - subtotal).toFixed(2)} ETB recorded as Tip.
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handleClearVerification(selectedOrder.id)}
                    style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear phone verification
                  </button>
                </div>
              </div>
            )}

            {/* Method */}
            <label className="input-label">Payment Method</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {PAYMENT_METHODS.map(m => (
                <button key={m} className={`btn btn-sm ${method === m ? 'btn-gold' : 'btn-outline'}`} onClick={() => setMethod(m)}>{m}</button>
              ))}
            </div>


            {/* Tip for digital payments */}
            {isDigitalPayment && (
              <div style={{ marginBottom: '14px', background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '8px', padding: '10px 12px' }}>
                <label className="input-label" style={{ color: 'var(--gold)', marginBottom: '6px' }}>💝 Tip (Optional)</label>
                <input
                  className="input"
                  type="number"
                  placeholder="0.00 ETB"
                  value={tipAmount}
                  onChange={e => setTipAmount(e.target.value)}
                  min="0"
                  step="5"
                />
              </div>
            )}

            {/* Discount */}
            {(session?.role === 'ADMIN' || session?.role === 'MANAGER') && (
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Discount (Manager)</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button className={`btn btn-sm ${discountType === 'fixed' ? 'btn-gold' : 'btn-outline'}`} onClick={() => setDiscountType('fixed')}>ETB</button>
                  <button className={`btn btn-sm ${discountType === 'percentage' ? 'btn-gold' : 'btn-outline'}`} onClick={() => setDiscountType('percentage')}>%</button>
                </div>
                <input className="input" type="number" placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'} value={discountValue} onChange={e => setDiscountValue(e.target.value)} />
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: '20px' }}>
              <label className="input-label">Notes (optional)</label>
              <input className="input" placeholder="e.g. Complimentary for VIP" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {/* Total */}
            <div className="divider-gold" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
              <span>{subtotal.toFixed(2)} ETB</span>
            </div>
            {discountAmt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--warning-light)' }}>Discount</span>
                <span style={{ color: 'var(--warning-light)' }}>-{discountAmt.toFixed(2)} ETB</span>
              </div>
            )}
            {tipAmt > 0 && isDigitalPayment && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--gold)' }}>💝 Tip</span>
                <span style={{ color: 'var(--gold)' }}>+{tipAmt.toFixed(2)} ETB</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={{ fontWeight: '700', fontSize: '16px' }}>TOTAL</span>
              <span style={{ fontWeight: '700', fontSize: '24px', color: 'var(--gold)' }}>{total.toFixed(2)} ETB</span>
            </div>

            <button className="btn btn-gold btn-lg" style={{ width: '100%' }} onClick={handlePay} disabled={loading}>
              <CheckCircle size={18} />
              {loading ? 'Processing...' : `Collect ${total.toFixed(2)} ETB`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
