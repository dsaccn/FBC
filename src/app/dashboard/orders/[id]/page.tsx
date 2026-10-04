'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Printer, X, CheckCircle, AlertCircle, Plus } from 'lucide-react'
import Link from 'next/link'
import { toast } from '@/components/ToastProvider'
import Portal from '@/components/Portal'
import { printTicketHtml } from '@/lib/printer'

interface OrderItem {
  id: string
  menuItem: { id: string; name: string; price: number; category?: { name: string; type: string } | null }
  quantity: number
  notes?: string
  status: string
  cancellation?: { reason: string; manager: { fullName: string } }
}
interface Order {
  id: string
  table: { number: string }
  waiter: { fullName: string }
  orderItems: OrderItem[]
  status: string
  createdAt: string
  payment?: { amount: number; method: string; cashier: { fullName: string }; discount: number; createdAt: string }
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<{ id: string; username: string; fullName: string; role: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<OrderItem | null>(null)
  const [cancelQuantity, setCancelQuantity] = useState<number>(1)
  const [cancelReason, setCancelReason] = useState('')
  const [managerPassword, setManagerPassword] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [orderRes, sessRes] = await Promise.all([fetch(`/api/orders/${id}`), fetch('/api/auth/me')])
      if (orderRes.ok) setOrder(await orderRes.json())
      if (sessRes.ok) setSession(await sessRes.json())
    } catch {
      toast.error('Failed to load order details')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  function printCancellationTicket(item: OrderItem, tableNumber: string, qty: number) {
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })
    const html = `<html>
      <head>
        <title>Cancellation Ticket</title>
        <style>
          @page { margin: 0; }
          *, *:before, *:after { box-sizing: border-box; }
          body { margin: 0; padding: 10px 15px; font-family: Courier New, monospace; width: 100%; font-size: 13px; color: #000; background: #fff; font-weight: bold; }
          hr { border-top: 1px dashed #000; border-bottom: none; border-left: none; border-right: none; margin: 8px 0; }
        </style>
      </head>
      <body>
      <div style="text-align:center;margin-bottom:10px;">
        <b style="font-size:17px;letter-spacing:2px;">Kogna Coffee</b><br/>
        <span style="font-size:11px;">Addis Ababa, Ethiopia</span><br/>
        <hr/>
        <span style="border: 2px solid #000; padding: 3px 8px; font-size: 14px;">CANCELLED ITEM</span>
      </div>
      <div style="margin-bottom:10px;font-size:13px;">
        <b>Table:</b> ${tableNumber}<br/>
        <b>Voided Qty:</b> ${qty}x ${item.menuItem.name}<br/>
        <b>Reason:</b> ${cancelReason}<br/>
        <b>Manager:</b> ${session?.fullName || 'Manager'}<br/>
        <b>Date:</b> ${now}
      </div>
      <hr/>
      <div style="text-align:center;font-size:10px;color:#555;letter-spacing:1px;margin-top:8px;">
        MEBA TECH PRO
      </div>
      </body></html>`
    printTicketHtml(html)
  }

  async function handleCancel() {
    if (!cancelTarget || !cancelReason.trim() || !session) {
      toast.warning('Please enter a cancellation reason')
      return
    }
    setCancelLoading(true)
    setCancelError('')

    try {
      // Verify manager via login check
      const verRes = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: session.username || '', password: managerPassword }),
      })
      if (!verRes.ok && !['ADMIN', 'MANAGER'].includes(session.role)) {
        setCancelError('Manager approval required')
        toast.error('Manager authorization failed')
        setCancelLoading(false)
        return
      }

      await fetch('/api/cancellations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderItemId: cancelTarget.id, managerId: session.id, reason: cancelReason, cancelQuantity }),
      })

      printCancellationTicket(cancelTarget, order!.table.number, cancelQuantity)
      toast.success(`Cancelled ${cancelQuantity}x ${cancelTarget.menuItem.name}`)
      setCancelTarget(null)
      setCancelQuantity(1)
      setCancelReason('')
      setMangerPassword('')
      load()
    } catch {
      toast.error('Network error during cancellation')
    } finally {
      setCancelLoading(false)
    }
  }

  function setMangerPassword(v: string) { setManagerPassword(v) }

  function printReceipt() {
    if (!order) return
    const total = order.orderItems.filter(i => i.status !== 'CANCELLED').reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })
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
      <div style="margin-bottom:10px;">
        <b>Table:</b> ${order.table.number}<br/>
        <b>Waiter:</b> ${order.waiter.fullName}<br/>
        <b>Cashier:</b> ${order.payment?.cashier?.fullName || '-'}<br/>
        <b>Date:</b> ${now}
      </div>
      <hr/>
      ${order.orderItems.filter(i => i.status !== 'CANCELLED').map(i => `
        <div style="display:flex;justify-content:space-between;">
          <span>${i.quantity}x ${i.menuItem.name}</span>
          <span>${(i.menuItem.price * i.quantity).toFixed(2)} ETB</span>
        </div>
      `).join('')}
      <hr/>
      ${order.payment?.discount ? `<div style="display:flex;justify-content:space-between;"><span>Discount</span><span>-${order.payment.discount.toFixed(2)} ETB</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px;">
        <span>TOTAL</span><span>${(order.payment?.amount || total).toFixed(2)} ETB</span>
      </div>
      <div style="margin-top:8px;"><b>Payment:</b> ${order.payment?.method || '-'}</div>
      <hr/>
      <div style="text-align:center;font-size:10px;color:#555;letter-spacing:1px;margin-top:8px;">
        MEBA TECH PRO
      </div>
    </body></html>`
    printTicketHtml(html)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading...</div>
  if (!order) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--danger-light)' }}>Order not found.</div>

  const activeItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
  const total = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)

  return (
    <div className="animate-fade-in" style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}><span className="gold-text">Order — Table {order.table.number}</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Waiter: {order.waiter.fullName} · {new Date(order.createdAt).toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {order.status === 'PAID' && <button className="btn btn-outline btn-sm" onClick={printReceipt}><Printer size={14} /> Print Receipt</button>}
          {order.status === 'OPEN' && (
            <>
              <Link href={`/dashboard/orders/new?tableId=${order.table.number}`} className="btn btn-outline btn-sm"><Plus size={14} /> Add Items</Link>
              <Link href={`/dashboard/payment?orderId=${order.id}`} className="btn btn-gold btn-sm">Process Payment</Link>
            </>
          )}
        </div>
      </div>

      {/* Order Items */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <h3 style={{ fontWeight: '600', marginBottom: '16px' }}>Items</h3>
        {order.orderItems.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--black-border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: '500', ...(item.status === 'CANCELLED' ? { textDecoration: 'line-through', opacity: 0.5 } : {}) }}>
                  {item.quantity}x {item.menuItem.name}
                </span>
                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '8px', background: item.status === 'PRINTED' ? 'rgba(82,183,136,0.15)' : item.status === 'CANCELLED' ? 'rgba(90,80,64,0.2)' : 'rgba(201,168,76,0.1)', color: item.status === 'PRINTED' ? 'var(--success-light)' : item.status === 'CANCELLED' ? 'var(--text-muted)' : 'var(--gold)' }}>
                  {item.status}
                </span>
                {item.menuItem.category?.type && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.menuItem.category.type === 'FOOD' ? '🍳' : '🍹'}</span>
                )}
              </div>
              {item.notes && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Note: {item.notes}</div>}
              {item.cancellation && <div style={{ fontSize: '12px', color: 'var(--danger-light)', marginTop: '2px' }}>Cancelled: {item.cancellation.reason} (by {item.cancellation.manager.fullName})</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--gold)', fontWeight: '600' }}>{(item.menuItem.price * item.quantity).toFixed(2)} ETB</div>
              {item.status !== 'CANCELLED' && order.status === 'OPEN' && (session?.role === 'ADMIN' || session?.role === 'MANAGER') && (
                <button className="btn btn-ghost btn-sm" style={{ padding: '3px 6px', fontSize: '11px', color: 'var(--danger-light)', marginTop: '4px' }} onClick={() => { setCancelTarget(item); setCancelQuantity(1); }}>
                  <X size={11} /> Cancel
                </button>
              )}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px' }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Total</span>
          <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>{total.toFixed(2)} ETB</span>
        </div>
      </div>

      {/* Payment info */}
      {order.payment && (
        <div className="card" style={{ background: 'rgba(82,183,136,0.05)', border: '1px solid var(--success-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <CheckCircle size={18} color="var(--success-light)" />
            <span style={{ fontWeight: '600', color: 'var(--success-light)' }}>Payment Received</span>
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <span>Amount: <b style={{ color: 'var(--text-primary)' }}>{order.payment.amount.toFixed(2)} ETB</b></span>
            <span>Method: <b style={{ color: 'var(--text-primary)' }}>{order.payment.method}</b></span>
            {order.payment.discount > 0 && <span>Discount: <b style={{ color: 'var(--gold)' }}>{order.payment.discount.toFixed(2)} ETB</b></span>}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelTarget && (
        <Portal>
          <div className="modal-overlay" onClick={() => setCancelTarget(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <AlertCircle size={20} color="var(--warning-light)" />
                <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Cancel Item</h3>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Cancelling: <b style={{ color: 'var(--text-primary)' }}>{cancelQuantity}x {cancelTarget.menuItem.name}</b> (from total {cancelTarget.quantity}x)
              </p>
              {cancelTarget.status === 'PRINTED' && (
                <div style={{ background: 'rgba(244,162,97,0.1)', border: '1px solid var(--warning-light)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: 'var(--warning-light)' }}>
                  ⚠ This item has already been printed. A cancellation ticket will be printed for the kitchen/bar.
                </div>
              )}
              {cancelTarget.quantity > 1 && (
                <>
                  <label className="input-label">Quantity to Cancel</label>
                  <input type="number" className="input" style={{ marginBottom: '12px' }} value={cancelQuantity} onChange={e => {
                    const val = parseInt(e.target.value) || 1;
                    setCancelQuantity(Math.min(Math.max(1, val), cancelTarget.quantity));
                  }} min={1} max={cancelTarget.quantity} />
                </>
              )}
              <label className="input-label">Reason for Cancellation</label>
              <input className="input" style={{ marginBottom: '12px' }} placeholder="e.g. Customer changed mind" value={cancelReason} onChange={e => setCancelReason(e.target.value)} autoFocus />
              {cancelError && <div style={{ color: 'var(--danger-light)', fontSize: '13px', marginBottom: '12px' }}>{cancelError}</div>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleCancel} disabled={cancelLoading}>
                  {cancelLoading ? 'Processing...' : 'Confirm Cancel & Print'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setCancelTarget(null); setCancelError('') }}>Back</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
