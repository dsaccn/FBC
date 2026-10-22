'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Printer, FileText, X, CheckCircle, AlertCircle, Plus, Unlink, Merge, Scissors, Users } from 'lucide-react'
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
  tableId: string
  table: {
    id: string
    number: string
    mergeGroupId?: string | null
    mergeGroupLabel?: string | null
    mergedWithId?: string | null
  }
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
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [splitMode, setSplitMode] = useState<'equal' | 'items'>('equal')
  const [splitCount, setSplitCount] = useState(2)
  const [itemAssignments, setItemAssignments] = useState<Record<string, number>>({}) // splitId → person (1-based)

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
      <div style="text-align:center;font-size:12px;font-weight:900;color:#000;letter-spacing:1.5px;margin-top:8px;">
        <b>MEBA TECH PRO</b>
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

  function printBill() {
    if (!order) return
    const activeItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
    const subtotal = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
    const discount = order.payment?.discount || 0
    const totalDue = Math.max(0, subtotal - discount)
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })
    const html = `<html>
      <head>
        <title>Bill</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          *, *:before, *:after { box-sizing: border-box; }
          body { margin: 0; padding: 10px 15px; font-family: 'Courier New', monospace; width: 100%; font-size: 13px; color: #000; background: #fff; line-height: 1.35; }
          hr { border-top: 1px dashed #000; border-bottom: none; border-left: none; border-right: none; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        </style>
      </head>
      <body>
      <div style="text-align:center;margin-bottom:10px;">
        <b style="font-size:18px;letter-spacing:2px;">Kogna Coffee</b><br/>
        <span style="font-size:11px;">Addis Ababa, Ethiopia</span><br/>
        <hr/>
        <b style="font-size:15px;letter-spacing:2px;">BILL</b>
      </div>
      <div style="margin-bottom:8px;font-size:12px;">
        <b>Table:</b> ${order.table.number}<br/>
        <b>Waiter:</b> ${order.waiter.fullName}<br/>
        <b>Time:</b> ${now}
      </div>
      <hr/>
      ${activeItems.map(i => `
        <div class="row">
          <span><b>${i.quantity}x</b> ${i.menuItem.name}</span>
          <span>${(i.menuItem.price * i.quantity).toFixed(2)} ETB</span>
        </div>
      `).join('')}
      <hr/>
      ${discount > 0 ? `
        <div class="row"><span>Subtotal</span><span>${subtotal.toFixed(2)} ETB</span></div>
        <div class="row"><span>Discount</span><span>-${discount.toFixed(2)} ETB</span></div>
      ` : ''}
      <div class="row" style="font-weight:bold;font-size:16px;border-top:2px solid #000;padding-top:6px;margin-top:4px;">
        <span>AMOUNT DUE</span><span>${totalDue.toFixed(2)} ETB</span>
      </div>
      <hr/>
      <div style="text-align:center;font-size:11px;color:#444;margin-top:6px;">Thank you — please proceed to payment</div>
      <div style="text-align:center;font-size:12px;font-weight:900;color:#000;letter-spacing:1.5px;margin-top:6px;"><b>MEBA TECH PRO</b></div>
    </body></html>`
    printTicketHtml(html)
  }

  function printSplitBill(personNum: number, items: { name: string; price: number; quantity: number; notes?: string }[], personTotal: number, splitLabel: string) {
    if (!order) return
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })
    const html = `<html>
      <head>
        <title>Bill – ${splitLabel}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          *, *:before, *:after { box-sizing: border-box; }
          body { margin: 0; padding: 10px 15px; font-family: 'Courier New', monospace; width: 100%; font-size: 13px; color: #000; background: #fff; line-height: 1.35; }
          hr { border-top: 1px dashed #000; border-bottom: none; border-left: none; border-right: none; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        </style>
      </head>
      <body>
      <div style="text-align:center;margin-bottom:8px;">
        <b style="font-size:18px;letter-spacing:2px;">Kogna Coffee</b><br/>
        <span style="font-size:11px;">Addis Ababa, Ethiopia</span><br/>
        <hr/>
        <b style="font-size:15px;letter-spacing:2px;">BILL — ${splitLabel}</b>
      </div>
      <div style="font-size:12px;margin-bottom:8px;">
        <b>Table:</b> ${order.table.number}<br/>
        <b>Waiter:</b> ${order.waiter.fullName}<br/>
        <b>Time:</b> ${now}
      </div>
      <hr/>
      ${items.map(i => `
        <div class="row">
          <span><b>${i.quantity}x</b> ${i.name}</span>
          <span>${(i.price * i.quantity).toFixed(2)} ETB</span>
        </div>
      `).join('')}
      <hr/>
      <div class="row" style="font-weight:bold;font-size:16px;border-top:2px solid #000;padding-top:6px;margin-top:4px;">
        <span>AMOUNT DUE</span><span>${personTotal.toFixed(2)} ETB</span>
      </div>
      <hr/>
      <div style="text-align:center;font-size:11px;color:#444;margin-top:6px;">Thank you — please proceed to payment</div>
      <div style="text-align:center;font-size:12px;font-weight:900;color:#000;letter-spacing:1.5px;margin-top:6px;"><b>MEBA TECH PRO</b></div>
    </body></html>`
    printTicketHtml(html)
  }

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
      <div style="text-align:center;font-size:12px;font-weight:900;color:#000;letter-spacing:1.5px;margin-top:8px;">
        <b>MEBA TECH PRO</b>
      </div>
    </body></html>`
    printTicketHtml(html)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading...</div>
  if (!order) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--danger-light)' }}>Order not found.</div>

  async function handleUnmerge() {
    if (!order?.table?.id) return
    if (!confirm(`Dismerge / Unmerge these tables? The active order will remain safely on Table ${order.table.number}.`)) return
    try {
      const res = await fetch(`/api/tables/merge?tableId=${encodeURIComponent(order.table.id)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Tables unmerged successfully!')
        load()
      } else {
        toast.error(data.error || 'Failed to unmerge tables')
      }
    } catch {
      toast.error('Network error unmerging tables')
    }
  }

  const activeItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
  const total = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)

  return (
    <div className="animate-fade-in" style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>
              <span className="gold-text">Order — Table {order.table.mergeGroupLabel || order.table.number}</span>
            </h1>
            {order.table.mergeGroupId && (
              <span className="badge" style={{ background: 'rgba(201,168,76,0.18)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.35)', fontSize: '11px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Merge size={11} /> Merged Unit [{order.table.mergeGroupId}]
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Waiter: {order.waiter.fullName} · {new Date(order.createdAt).toLocaleString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Africa/Addis_Ababa'
            })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {order.status === 'PAID' && <button className="btn btn-outline btn-sm" onClick={printReceipt}><Printer size={14} /> Print Receipt</button>}
          {order.status === 'OPEN' && (
            <>
              <button className="btn btn-outline btn-sm" onClick={printBill}><FileText size={14} /> Print Bill</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setShowSplitModal(true); setSplitMode('equal'); setSplitCount(2); setItemAssignments({}) }} style={{ borderColor: 'rgba(201,168,76,0.5)', color: 'var(--gold)' }}><Scissors size={14} /> Separate Bill</button>
              {order.table.mergeGroupId && (
                <button className="btn btn-outline btn-sm" onClick={handleUnmerge} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Unlink size={14} /> Unmerge Tables
                </button>
              )}
              <Link href={`/dashboard/orders/new?tableId=${order.table.id}`} className="btn btn-outline btn-sm"><Plus size={14} /> Add Items</Link>
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
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.menuItem.category.type === 'FOOD' ? '🍳' : item.menuItem.category.type === 'DRINK' ? '🍹' : '📦'}</span>
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

      {/* Separate Bill Modal */}
      {showSplitModal && (() => {
        const expandedItems = activeItems.flatMap(item =>
          Array.from({ length: item.quantity }, (_, i) => ({
            id: item.id,
            splitId: `${item.id}_${i}`,
            name: item.menuItem.name,
            price: item.menuItem.price,
            notes: item.notes,
          }))
        )
        const COLORS = ['#C9A84C', '#38bdf8', '#86efac', '#f97316', '#e879f9', '#fb7185', '#a3e635', '#67e8f9']
        const perPersonEqual = splitCount > 0 ? total / splitCount : 0

        const personItems = (pNum: number) => expandedItems.filter(e => (itemAssignments[e.splitId] ?? 0) === pNum)
        const personTotal = (pNum: number) => personItems(pNum).reduce((s, e) => s + e.price, 0)
        const assignedCount = expandedItems.filter(e => (itemAssignments[e.splitId] ?? 0) > 0).length
        const allAssigned = assignedCount === expandedItems.length

        return (
          <Portal>
            <div className="modal-overlay" onClick={() => setShowSplitModal(false)}>
              <div className="modal" style={{ maxWidth: '520px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Scissors size={18} color="var(--gold)" />
                    <span style={{ fontWeight: '700', fontSize: '16px' }}>Separate Bill — Table {order!.table.number}</span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowSplitModal(false)}><X size={16} /></button>
                </div>

                {/* Mode tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                  {(['equal', 'items'] as const).map(m => (
                    <button key={m} onClick={() => setSplitMode(m)}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s',
                        background: splitMode === m ? 'var(--gold)' : 'transparent',
                        color: splitMode === m ? '#000' : 'var(--text-secondary)',
                        borderColor: splitMode === m ? 'var(--gold)' : 'var(--black-border)' }}>
                      {m === 'equal' ? '⚖ Equal Split' : '🍽 By Items'}
                    </button>
                  ))}
                </div>

                {/* People count selector (both modes) */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    <Users size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    Number of people
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[2, 3, 4, 5, 6, 7, 8].map(n => (
                      <button key={n} onClick={() => setSplitCount(n)}
                        style={{ width: '38px', height: '38px', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', border: '2px solid',
                          background: splitCount === n ? COLORS[n - 2] || 'var(--gold)' : 'transparent',
                          color: splitCount === n ? '#000' : 'var(--text-secondary)',
                          borderColor: splitCount === n ? COLORS[n - 2] || 'var(--gold)' : 'var(--black-border)' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--black-border)', margin: '0 0 16px' }} />

                {/* ── Equal Split mode ── */}
                {splitMode === 'equal' && (
                  <div>
                    <div style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Each person pays</div>
                      <div style={{ fontSize: '26px', fontWeight: '900', color: 'var(--gold)' }}>{perPersonEqual.toFixed(2)} ETB</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{total.toFixed(2)} ETB ÷ {splitCount} people</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Array.from({ length: splitCount }, (_, i) => i + 1).map(pNum => (
                        <div key={pNum} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--black-border)', background: 'var(--card-bg)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: COLORS[pNum - 1] || '#ccc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', color: '#000' }}>{pNum}</span>
                            <span style={{ fontWeight: '600' }}>Person {pNum}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontWeight: '700', color: 'var(--gold)' }}>{perPersonEqual.toFixed(2)} ETB</span>
                            <button className="btn btn-outline btn-sm" style={{ fontSize: '12px', padding: '5px 10px' }}
                              onClick={() => printSplitBill(pNum, activeItems.map(i => ({ name: i.menuItem.name, price: i.menuItem.price / i.quantity, quantity: 1, notes: i.notes })), perPersonEqual, `Person ${pNum} of ${splitCount}`)}>
                              <Printer size={13} /> Print
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="btn btn-gold btn-sm" style={{ width: '100%', marginTop: '14px', padding: '10px' }}
                      onClick={() => {
                        for (let p = 1; p <= splitCount; p++) {
                          printSplitBill(p, activeItems.map(i => ({ name: i.menuItem.name, price: i.menuItem.price / i.quantity, quantity: 1, notes: i.notes })), perPersonEqual, `Person ${p} of ${splitCount}`)
                        }
                      }}>
                      <Printer size={14} /> Print All {splitCount} Bills
                    </button>
                  </div>
                )}

                {/* ── By Items mode ── */}
                {splitMode === 'items' && (
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                      Tap a person number on each item row to assign it. Items with quantity &gt; 1 are shown as separate units.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                      {expandedItems.map((item, idx) => {
                        const assigned = itemAssignments[item.splitId] ?? 0
                        return (
                          <div key={item.splitId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', border: `1.5px solid ${assigned > 0 ? COLORS[assigned - 1] || '#ccc' : 'var(--black-border)'}`, background: assigned > 0 ? `${COLORS[assigned - 1]}18` : 'var(--card-bg)', transition: 'all 0.15s' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '16px' }}>{idx + 1}.</span>
                            <span style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>{item.name}</span>
                            <span style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: '600', marginRight: '6px' }}>{item.price.toFixed(2)}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {Array.from({ length: splitCount }, (_, i) => i + 1).map(pNum => (
                                <button key={pNum} onClick={() => setItemAssignments(prev => ({ ...prev, [item.splitId]: prev[item.splitId] === pNum ? 0 : pNum }))}
                                  style={{ width: '26px', height: '26px', borderRadius: '50%', fontWeight: '700', fontSize: '12px', cursor: 'pointer', border: '2px solid',
                                    background: assigned === pNum ? COLORS[pNum - 1] || '#ccc' : 'transparent',
                                    color: assigned === pNum ? '#000' : 'var(--text-muted)',
                                    borderColor: COLORS[pNum - 1] || 'var(--black-border)' }}>
                                  {pNum}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Per-person totals */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                      {Array.from({ length: splitCount }, (_, i) => i + 1).map(pNum => {
                        const pItems = personItems(pNum)
                        const pTotal = personTotal(pNum)
                        return (
                          <div key={pNum} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', border: `1.5px solid ${COLORS[pNum - 1] || 'var(--black-border)'}`, background: `${COLORS[pNum - 1]}12` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: COLORS[pNum - 1] || '#ccc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px', color: '#000' }}>{pNum}</span>
                              <span style={{ fontSize: '13px' }}>{pItems.length} item{pItems.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontWeight: '700', color: pTotal > 0 ? 'var(--gold)' : 'var(--text-muted)' }}>{pTotal.toFixed(2)} ETB</span>
                              <button className="btn btn-outline btn-sm" style={{ fontSize: '12px', padding: '5px 10px' }} disabled={pItems.length === 0}
                                onClick={() => printSplitBill(pNum, pItems.map(e => ({ name: e.name, price: e.price, quantity: 1 })), pTotal, `Person ${pNum} of ${splitCount}`)}>
                                <Printer size={13} /> Print
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {!allAssigned && (
                      <div style={{ fontSize: '12px', color: 'var(--warning-light)', marginBottom: '10px' }}>
                        ⚠ {expandedItems.length - assignedCount} item{expandedItems.length - assignedCount !== 1 ? 's' : ''} not yet assigned
                      </div>
                    )}
                    <button className="btn btn-gold btn-sm" style={{ width: '100%', padding: '10px' }} disabled={!allAssigned}
                      onClick={() => {
                        for (let p = 1; p <= splitCount; p++) {
                          const pItems = personItems(p)
                          if (pItems.length > 0) printSplitBill(p, pItems.map(e => ({ name: e.name, price: e.price, quantity: 1 })), personTotal(p), `Person ${p} of ${splitCount}`)
                        }
                      }}>
                      <Printer size={14} /> Print All Separate Bills
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Portal>
        )
      })()}

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
