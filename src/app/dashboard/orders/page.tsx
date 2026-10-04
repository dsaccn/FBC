'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Eye, RefreshCw, Calendar, Bike, ShoppingBag, UtensilsCrossed } from 'lucide-react'

interface OrderItem {
  id: string
  menuItem: { name: string; price: number; category?: { name: string; type: string } | null }
  quantity: number
  notes?: string
  status: string
}

interface Order {
  id: string
  table: { number: string }
  waiter: { fullName: string }
  orderItems: OrderItem[]
  status: string
  createdAt: string
  payment?: { amount: number }
}

export default function OrdersPage() {
  const searchParams = useSearchParams()
  const tableId = searchParams.get('tableId')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('OPEN')

  // Helper to format date in local timezone YYYY-MM-DD
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Date filter — default to present local day
  const [dateFrom, setDateFrom] = useState(() => getLocalDateStr())
  const [dateTo, setDateTo] = useState(() => getLocalDateStr())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tableId) params.set('tableId', tableId)
      if (filter) params.set('status', filter)
      // Only apply date range filter when viewing non-OPEN orders (PAID, CANCELLED, All)
      if (filter !== 'OPEN') {
        if (dateFrom) params.set('from', dateFrom)
        if (dateTo) params.set('to', dateTo)
      }
      const res = await fetch(`/api/orders?${params.toString()}`)
      if (res.ok) {
        setOrders(await res.json())
      } else {
        console.error('Failed to load orders:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading orders:', err)
    } finally {
      setLoading(false)
    }
  }, [tableId, filter, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  // Auto-refresh when OfflineBanner pulls new orders or periodically every 10s
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])
  useEffect(() => {
    const handleCloudPull = () => loadRef.current()
    const handleSyncComplete = () => loadRef.current()
    window.addEventListener('cloud-pull-complete', handleCloudPull)
    window.addEventListener('sync-complete', handleSyncComplete)
    const interval = setInterval(() => loadRef.current(), 10000)
    return () => {
      window.removeEventListener('cloud-pull-complete', handleCloudPull)
      window.removeEventListener('sync-complete', handleSyncComplete)
      clearInterval(interval)
    }
  }, [])

  const statusColors: Record<string, string> = { OPEN: 'badge-open', PAID: 'badge-paid', CANCELLED: 'badge-cancelled' }

  // Helper: parse delivery/takeaway or standard table
  const parseOrderInfo = (tableNumber: string) => {
    const lower = tableNumber.toLowerCase()
    const isDelivery = lower.startsWith('delivery:')
    const isTakeaway = lower.startsWith('takeaway:')

    if (!isDelivery && !isTakeaway) {
      return {
        isSpecial: false,
        type: 'TABLE',
        title: `Table ${tableNumber}`,
        boxLabel: tableNumber,
        phone: null,
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

    return {
      isSpecial: true,
      type,
      title: cleanName || (isDelivery ? 'Delivery Order' : 'Takeaway Order'),
      boxLabel: isDelivery ? '🛵' : '🥡',
      phone: extractedPhone,
    }
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '32px' }}>
      {/* Page Header with Top Date Range Picker */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}><span className="gold-text">Orders</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>{orders.length} orders found</p>
        </div>

        {/* Date Filter: Clean pair on top */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--black-border)',
          borderRadius: '10px',
          padding: '4px 10px',
        }}>
          <input
            type="date"
            className="input"
            style={{ fontSize: '13px', padding: '4px 8px', height: '32px', width: '135px' }}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
          <input
            type="date"
            className="input"
            style={{ fontSize: '13px', padding: '4px 8px', height: '32px', width: '135px' }}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
          <Link href={`/dashboard/orders/new${tableId ? `?tableId=${tableId}` : ''}`} className="btn btn-gold btn-sm">
            <Plus size={14} /> New Order
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['OPEN', 'PAID', 'CANCELLED', ''].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-gold' : 'btn-outline'}`} onClick={() => setFilter(s)}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
          <p>No orders found for the selected period.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map(order => {
            const total = order.orderItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
            const food = order.orderItems.filter(i => i.menuItem.category?.type === 'FOOD')
            const drinks = order.orderItems.filter(i => i.menuItem.category?.type === 'DRINK')
            const info = parseOrderInfo(order.table.number)

            return (
              <div key={order.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {/* Visual Identifier Box */}
                <div style={{
                  width: '52px',
                  height: '52px',
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
                  fontSize: info.isSpecial ? '22px' : '17px',
                  color: 'var(--gold)',
                  flexShrink: 0
                }}>
                  {info.boxLabel}
                </div>

                {/* Order Details */}
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '600', fontSize: '15px' }}>{info.title}</span>

                    {info.isSpecial && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: info.type === 'DELIVERY' ? 'rgba(59,130,246,0.15)' : 'rgba(234,88,12,0.15)',
                        color: info.type === 'DELIVERY' ? '#60a5fa' : '#fb923c',
                        border: `1px solid ${info.type === 'DELIVERY' ? 'rgba(59,130,246,0.3)' : 'rgba(234,88,12,0.3)'}`,
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {info.type === 'DELIVERY' ? <Bike size={11} /> : <ShoppingBag size={11} />}
                        {info.type === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
                      </span>
                    )}

                    {info.phone && (
                      <span style={{ fontSize: '12px', color: 'var(--gold)', background: 'rgba(201,168,76,0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                        📞 {info.phone}
                      </span>
                    )}

                    <span className={`badge ${statusColors[order.status] || ''}`}>{order.status}</span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Waiter: {order.waiter.fullName} · {new Date(order.createdAt).toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {order.orderItems.length} items {food.length > 0 && `· 🍳 ${food.length} food`} {drinks.length > 0 && `· 🍹 ${drinks.length} drinks`}
                  </div>
                </div>

                {/* Amount & Actions */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--gold)' }}>{total.toFixed(2)} ETB</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                    <Link href={`/dashboard/orders/${order.id}`} className="btn btn-outline btn-sm"><Eye size={13} /> View</Link>
                    {order.status === 'OPEN' && (
                      <Link href={`/dashboard/payment?orderId=${order.id}`} className="btn btn-gold btn-sm">Pay</Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
