'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Printer, CheckCircle } from 'lucide-react'
import { toast } from '@/components/ToastProvider'

interface OrderItem { id: string; menuItem: { name: string; price: number; category: { name: string } }; quantity: number; notes?: string; status: string }
interface Order { id: string; table: { number: string; id: string }; waiter: { fullName: string }; orderItems: OrderItem[]; status: string }

const PAYMENT_METHODS = ['Cash', 'Telebirr', 'CBE', 'Abyssinia']

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
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [lastPayment, setLastPayment] = useState<{ amount: number; method: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [ordRes, sessRes] = await Promise.all([
        fetch('/api/orders?status=OPEN'),
        fetch('/api/auth/me'),
      ])
      if (ordRes.ok) {
        const ords = await ordRes.json()
        setOrders(ords)
        if (orderId) {
          const found = ords.find((o: Order) => o.id === orderId)
          if (found) setSelectedOrder(found)
        }
      } else {
        toast.error('Failed to load open orders')
      }
      if (sessRes.ok) setSession(await sessRes.json())
    } catch {
      toast.error('Network error loading payments')
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

  const activeItems = selectedOrder?.orderItems.filter(i => i.status !== 'CANCELLED') || []
  const subtotal = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
  const discountAmt = discountValue
    ? discountType === 'percentage' ? (subtotal * parseFloat(discountValue)) / 100 : parseFloat(discountValue)
    : 0
  const total = Math.max(0, subtotal - discountAmt)

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
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrder.id, cashierId: session.id, amount: total, method, discount: discountAmt, discountType, notes }),
      })
      if (res.ok) {
        setLastPayment({ amount: total, method })
        setPaid(true)
        toast.success(`Payment of ${total.toFixed(2)} ETB (${method}) processed successfully!`)
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
    const win = window.open('', '_blank', 'width=400,height=700')
    if (!win) {
      toast.warning('Please allow popups to print receipt')
      return
    }
    win.document.write(`<html>
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
        <b style="font-size:16px;letter-spacing:2px;">MEBA TECH PRO POS</b><br/>
        <span style="font-size:11px;">Coffee House &amp; Lounge · Addis Ababa</span><br/>
        <hr/>
        <b>RECEIPT</b>
      </div>
      <div style="margin-bottom:10px;font-size:13px;">
        <b>Table:</b> ${selectedOrder.table.number}<br/>
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
      <div style="text-align:center;font-size:11px;">Thank you for visiting Diva Addis Lounge!<br/>እናመሰግናለን!</div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 300)
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
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '32px' }}>Table is now marked as Free.</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn btn-outline" onClick={printReceipt}><Printer size={16} /> Print Receipt</button>
          <button className="btn btn-gold" onClick={() => window.location.href = '/dashboard/tables'}>Back to Tables</button>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {orders.map(o => {
                const t = o.orderItems.filter(i => i.status !== 'CANCELLED').reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
                return (
                  <div key={o.id} className="card card-hover" onClick={() => setSelectedOrder(o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontWeight: '600' }}>Table {o.table.number}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{o.waiter.fullName} · {o.orderItems.length} items</div>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--gold)' }}>{t.toFixed(2)} ETB</div>
                  </div>
                )
              })}
              {orders.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No open orders.</p>}
            </div>
          </div>
        ) : (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: '600' }}>Table {selectedOrder.table.number} — Bill</h3>
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
            <h3 style={{ fontWeight: '600', marginBottom: '20px' }}>Payment Details</h3>

            {/* Method */}
            <label className="input-label">Payment Method</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {PAYMENT_METHODS.map(m => (
                <button key={m} className={`btn btn-sm ${method === m ? 'btn-gold' : 'btn-outline'}`} onClick={() => setMethod(m)}>{m}</button>
              ))}
            </div>

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
