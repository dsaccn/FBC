'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Printer, Plus, Minus, X, AlertCircle, ShoppingBag, ArrowLeft, Unlink, Merge } from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import Portal from '@/components/Portal'
import { printTicketHtml } from '@/lib/printer'

interface MenuItem { id: string; name: string; price: number; description?: string; category?: { name: string; type: string } | null }
interface Category { id: string; name: string; type: string; menuItems: MenuItem[] }
interface CartItem { menuItem: MenuItem; quantity: number; notes: string }
interface Order { id: string; table: { number: string; mergeGroupId?: string | null; mergeGroupLabel?: string | null }; waiter: { fullName: string }; orderItems: OrderItemType[]; status: string }
interface OrderItemType { id: string; menuItem: MenuItem & { category?: { name: string; type: string } | null }; quantity: number; notes?: string; status: string }

export default function NewOrderPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tableId = searchParams.get('tableId') || ''

  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [existingOrder, setExistingOrder] = useState<Order | null>(null)
  const [tableNumber, setTableNumber] = useState<string>('')
  const [tableInfo, setTableInfo] = useState<any>(null)
  const [session, setSession] = useState<{ id: string; fullName: string; role: string } | null>(null)
  const [noteTarget, setNoteTarget] = useState<string | null>(null)
  const [tempNote, setTempNote] = useState('')
  const [mobileShowCart, setMobileShowCart] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [catRes, sessRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/auth/me'),
      ])
      if (catRes.ok) {
        const cats = await catRes.json()
        setCategories(cats)
        if (cats.length > 0) setActiveCategory(cats[0].id)
      } else {
        console.error('Failed to load categories:', catRes.statusText)
      }
      if (sessRes.ok) {
        setSession(await sessRes.json())
      }

      if (tableId) {
        // Fetch the table to get its display number
        const [tableRes, ordRes] = await Promise.all([
          fetch('/api/tables'),
          fetch(`/api/orders?tableId=${tableId}&status=OPEN`),
        ])
        if (tableRes.ok) {
          const tables = await tableRes.json()
          const found = tables.find((t: any) => t.id === tableId)
          if (found) {
            setTableNumber(found.displayLabel || found.mergeGroupLabel || found.number)
            setTableInfo(found)
          }
        } else {
          console.error('Failed to load tables:', tableRes.statusText)
        }
        if (ordRes.ok) {
          const orders = await ordRes.json()
          if (orders.length > 0) setExistingOrder(orders[0])
        } else {
          console.error('Failed to load orders:', ordRes.statusText)
        }
      }
    } catch (err) {
      console.error('Error loading page data:', err)
    }
  }, [tableId])

  useEffect(() => { loadData() }, [loadData])

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id)
      if (existing) return prev.map(c => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { menuItem: item, quantity: 1, notes: '' }]
    })
    toast.success(`Added ${item.name}`, 1500)
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => prev.map(c => c.menuItem.id === id ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c).filter(c => c.quantity > 0))
  }

  function removeFromCart(id: string) {
    setCart(prev => prev.filter(c => c.menuItem.id !== id))
    toast.info('Item removed from cart', 1500)
  }

  function saveNote(id: string) {
    setCart(prev => prev.map(c => c.menuItem.id === id ? { ...c, notes: tempNote } : c))
    setNoteTarget(null)
    setTempNote('')
    toast.success('Special note added', 1500)
  }

  const subtotal = cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0)
  const totalCartCount = cart.reduce((s, c) => s + c.quantity, 0)
  const foodItems = cart.filter(c => c.menuItem.category?.type === 'FOOD')
  const drinkItems = cart.filter(c => c.menuItem.category?.type === 'DRINK')

  function generateTicketHTML(type: 'KITCHEN' | 'BAR' | 'CASHIER', tableNumber: string, waiterName: string, items: CartItem[]) {
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })
    return `
      <div style="font-family:'Courier New',monospace;font-size:13px;width:100%;padding:10px 15px;color:#000;background:#fff;box-sizing:border-box;">
        <div style="text-align:center;margin-bottom:8px;">
          <div style="font-size:18px;font-weight:bold;letter-spacing:2px;">Kogna Coffee</div>
          <div style="font-size:10px;letter-spacing:1px;">Addis Ababa, Ethiopia</div>
          <hr style="border-top:1px dashed #000;border-bottom:none;border-left:none;border-right:none;margin:8px 0;"/>
          <div style="font-size:15px;font-weight:bold;border:2px solid #000;display:inline-block;padding:4px 12px;">
            ${type === 'KITCHEN' ? '🍳 KITCHEN COPY' : type === 'BAR' ? '🍹 BAR COPY' : '💰 CASHIER COPY'}
          </div>
        </div>
        <div style="margin:8px 0;">
          <div><b>Table:</b> ${tableNumber}${tableInfo?.credential ? ` [${tableInfo.credential}]` : ''}</div>
          <div><b>Waiter:</b> ${waiterName}</div>
          <div><b>Date:</b> ${now}</div>
        </div>
        <hr style="border-top:1px dashed #000;border-bottom:none;border-left:none;border-right:none;margin:8px 0;"/>
        <div>
          ${items.map(c => `
            <div style="margin-bottom:6px;">
              <div style="display:flex;justify-content:space-between;">
                <span><b>${c.quantity}x</b> ${c.menuItem.name}</span>
                ${type === 'CASHIER' ? `<span>${(c.menuItem.price * c.quantity).toFixed(2)} ETB</span>` : ''}
              </div>
              ${c.notes ? `<div style="font-size:11px;color:#555;padding-left:12px;">Note: ${c.notes}</div>` : ''}
            </div>
          `).join('')}
        </div>
        <hr style="border-top:1px dashed #000;border-bottom:none;border-left:none;border-right:none;margin:8px 0;"/>
        ${type === 'CASHIER' ? `<div style="text-align:right;font-weight:bold;">SUBTOTAL: ${subtotal.toFixed(2)} ETB</div>` : ''}
        <div style="text-align:center;margin-top:10px;font-size:10px;color:#555;letter-spacing:1px;">
          MEBA TECH PRO
        </div>
      </div>
    `
  }

  async function confirmOrder() {
    if (cart.length === 0) {
      toast.warning('Cart is empty. Please select menu items to place an order.')
      return
    }
    if (!session) {
      toast.error('Please log in to submit orders.')
      return
    }
    setLoading(true)
    setOrderError('')

    let orderId = existingOrder?.id
    let tableNumber = existingOrder?.table.number || tableId

    try {
      if (!orderId) {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableId,
            waiterId: session.id,
            items: cart.map(c => ({ menuItemId: c.menuItem.id, quantity: c.quantity, notes: c.notes })),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          const msg = data.error || 'Failed to create order. Please try again.'
          setOrderError(msg)
          toast.error(msg)
          setLoading(false)
          return
        }
        orderId = data.id
        tableNumber = data.table.number
      } else {
        const res = await fetch(`/api/orders/${orderId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: cart.map(c => ({ menuItemId: c.menuItem.id, quantity: c.quantity, notes: c.notes })) }),
        })
        if (!res.ok) {
          const data = await res.json()
          const msg = data.error || 'Failed to add items. Please try again.'
          setOrderError(msg)
          toast.error(msg)
          setLoading(false)
          return
        }
      }

      toast.success(`Order placed for Table ${tableNumber}! Tickets sent to printer.`)

      // Print tickets directly via hidden iframe
      let ticketHTML = `<html>
        <head>
          <title>Tickets</title>
          <style>
            @page { margin: 0; }
            *, *:before, *:after { box-sizing: border-box; }
            body { margin: 0; padding: 0; background: #fff; font-weight: bold; }
            @media print {
              hr.ticket-separator { border-top: 2px dashed #000; border-bottom: none; border-left: none; border-right: none; margin: 20px 0; page-break-after: always; }
            }
          </style>
        </head>
        <body>`

      if (foodItems.length > 0) {
        ticketHTML += generateTicketHTML('KITCHEN', tableNumber, session.fullName, foodItems)
        ticketHTML += '<hr class="ticket-separator"/>'
      }
      if (drinkItems.length > 0) {
        ticketHTML += generateTicketHTML('BAR', tableNumber, session.fullName, drinkItems)
        ticketHTML += '<hr class="ticket-separator"/>'
      }
      ticketHTML += generateTicketHTML('CASHIER', tableNumber, session.fullName, cart)
      ticketHTML += '</body></html>'

      const printFrame = document.createElement('iframe')
      printFrame.style.position = 'fixed'
      printFrame.style.top = '-10000px'
      printFrame.style.left = '-10000px'
      printFrame.style.width = '0'
      printFrame.style.height = '0'
      printFrame.style.border = 'none'
      document.body.appendChild(printFrame)

      const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document
      if (frameDoc) {
        frameDoc.open()
        frameDoc.write(ticketHTML)
        frameDoc.close()
        setTimeout(() => {
          printFrame.contentWindow?.print()
          setTimeout(() => {
            document.body.removeChild(printFrame)
          }, 1000)
        }, 300)
      }

      setLoading(false)
      setCart([])
      router.push('/dashboard/tables')
    } catch {
      toast.error('Network error placing order')
      setLoading(false)
    }
  }

  const activeCat = categories.find(c => c.id === activeCategory)

  // Cart content component reusable in both desktop and mobile views
  const renderCartContent = () => (
    <>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--black-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '600' }}>Order Summary</h2>
          {existingOrder && (
            <div style={{ fontSize: '12px', color: 'var(--gold)', marginTop: '4px' }}>
              ✦ Table {tableNumber} has {existingOrder.orderItems.filter((i: OrderItemType) => i.status !== 'CANCELLED').length} active item(s)
            </div>
          )}
        </div>
        {mobileShowCart && (
          <button className="btn btn-ghost btn-sm" onClick={() => setMobileShowCart(false)}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Already ordered summary */}
      {existingOrder && existingOrder.orderItems.filter((i: OrderItemType) => i.status !== 'CANCELLED').length > 0 && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--black-border)', background: 'rgba(201,168,76,0.03)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Already Ordered</div>
          {existingOrder.orderItems.filter((i: OrderItemType) => i.status !== 'CANCELLED').map((i: OrderItemType) => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
              <span>{i.quantity}x {i.menuItem.name}</span>
              <span style={{ color: i.status === 'PRINTED' ? 'var(--success-light)' : 'var(--text-muted)', fontSize: '10px' }}>{i.status}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛒</div>
            <p style={{ fontSize: '13px' }}>Tap items on the menu to add to cart</p>
          </div>
        ) : (
          cart.map(c => (
            <div key={c.menuItem.id} style={{ marginBottom: '10px', padding: '10px', background: 'var(--black-hover)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="btn btn-ghost btn-sm" style={{ padding: '4px', width: '28px', height: '28px' }} onClick={() => updateQty(c.menuItem.id, -1)}><Minus size={13} /></button>
                <span style={{ fontWeight: '600', minWidth: '20px', textAlign: 'center' }}>{c.quantity}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding: '4px', width: '28px', height: '28px' }} onClick={() => updateQty(c.menuItem.id, 1)}><Plus size={13} /></button>
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{c.menuItem.name}</div>
                <button className="btn btn-ghost btn-sm" style={{ padding: '4px', color: 'var(--danger-light)' }} onClick={() => removeFromCart(c.menuItem.id)}><X size={13} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', paddingLeft: '4px' }}>
                <button style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => { setNoteTarget(c.menuItem.id); setTempNote(c.notes) }}>
                  <AlertCircle size={11} /> {c.notes || 'Add note'}
                </button>
                <span style={{ fontSize: '13px', color: 'var(--gold)', fontWeight: 600 }}>{(c.menuItem.price * c.quantity).toFixed(2)} ETB</span>
              </div>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--black-border)', background: 'var(--black-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Subtotal</span>
            <span style={{ fontWeight: '700', fontSize: '17px', color: 'var(--gold)' }}>{subtotal.toFixed(2)} ETB</span>
          </div>
          <button className="btn btn-gold" style={{ width: '100%', fontSize: '15px', padding: '13px', marginBottom: '8px' }} onClick={confirmOrder} disabled={loading}>
            <Printer size={16} />
            {loading ? 'Printing...' : 'Confirm & Print Tickets'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => { setCart([]); toast.info('Cart cleared'); }}>Clear Cart</button>
        </div>
      )}
    </>
  )

  async function handleUnmergeFromOrder() {
    if (!tableId) return
    if (!confirm('Dismerge / Unmerge these tables? The active order will remain safely on the primary table.')) return
    try {
      const res = await fetch(`/api/tables/merge?tableId=${encodeURIComponent(tableId)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Tables unmerged successfully!')
        loadData()
      } else {
        toast.error(data.error || 'Failed to unmerge tables')
      }
    } catch {
      toast.error('Network error unmerging tables')
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', gap: '20px', minHeight: 'calc(100vh - 90px)' }}>
      {/* Left: Menu Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: cart.length > 0 ? '70px' : '0' }}>
        <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 className="font-cinzel" style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>
                <span className="gold-text">{existingOrder ? 'Add More Items' : 'New Order'}</span>
                {(tableNumber || tableId) && <span style={{ color: 'var(--text-secondary)', fontSize: '14px', marginLeft: '10px', fontFamily: 'Inter' }}>Table {tableNumber || tableId}</span>}
              </h1>
              {tableInfo?.isMerged && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge" style={{ background: 'rgba(201,168,76,0.18)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.35)', fontSize: '11px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Merge size={11} /> Merged Unit {tableInfo.credential ? `[${tableInfo.credential}]` : ''}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={handleUnmergeFromOrder}
                    title="Dismerge / Unmerge tables"
                  >
                    <Unlink size={11} /> Unmerge
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Quick mobile cart button in header */}
          <button
            className="btn btn-outline btn-sm mobile-only-flex"
            onClick={() => setMobileShowCart(true)}
            style={{ alignItems: 'center', gap: '6px' }}
          >
            <ShoppingBag size={14} />
            <span>Cart ({totalCartCount})</span>
          </button>
        </div>

        {orderError && (
          <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid var(--danger-light)', borderRadius: '8px', padding: '10px 14px', color: 'var(--danger-light)', fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚠ {orderError}
          </div>
        )}

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '14px', flexShrink: 0 }}>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`btn btn-sm ${activeCategory === cat.id ? 'btn-gold' : 'btn-outline'}`}
              onClick={() => setActiveCategory(cat.id)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {cat.type === 'FOOD' ? '🍽' : cat.type === 'DRINK' ? '🍹' : '📦'} {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Items Grid */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '10px' }}>
            {activeCat?.menuItems.map(item => {
              const inCart = cart.find(c => c.menuItem.id === item.id)
              return (
                <div
                  key={item.id}
                  className="card card-hover"
                  onClick={() => addToCart(item)}
                  style={{
                    padding: '14px 12px',
                    border: inCart ? '1.5px solid var(--gold)' : '1px solid var(--black-border)',
                    background: inCart ? 'rgba(201,168,76,0.1)' : 'var(--black-card)',
                    position: 'relative',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '88px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {inCart && (
                    <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'var(--gold)', color: 'var(--black)', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700' }}>
                      {inCart.quantity}
                    </div>
                  )}
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1.25', paddingRight: inCart ? '22px' : '0' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--gold)', fontWeight: '700', marginTop: '10px' }}>
                    {item.price.toFixed(2)} ETB
                  </div>
                </div>
              )
            })}
            {activeCat?.menuItems.length === 0 && (
              <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1', textAlign: 'center', padding: '30px' }}>No items in this category.</p>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Desktop Cart (hidden on mobile) */}
      <div className="desktop-only" style={{ width: '330px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(100vh - 110px)', background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
          {renderCartContent()}
        </div>
      </div>

      {/* Mobile Floating Bottom Bar */}
      {cart.length > 0 && !mobileShowCart && (
        <div
          className="mobile-only-flex"
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '12px',
            right: '12px',
            zIndex: 140,
            background: 'linear-gradient(135deg, #241C0E 0%, #1A1408 100%)',
            border: '1.5px solid var(--gold)',
            borderRadius: '14px',
            padding: '12px 16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.8), 0 0 16px rgba(201,168,76,0.25)',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--gold)' }}>{subtotal.toFixed(2)} ETB</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{totalCartCount} item(s) in order</div>
          </div>
          <button className="btn btn-gold btn-sm" onClick={() => setMobileShowCart(true)} style={{ padding: '8px 16px' }}>
            View Cart ({totalCartCount})
          </button>
        </div>
      )}

      {/* Mobile Cart Drawer Overlay */}
      {mobileShowCart && (
        <Portal>
          <div className="modal-overlay mobile-only-flex" style={{ zIndex: 300 }} onClick={() => setMobileShowCart(false)}>
            <div
              className="modal"
              style={{
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                overflow: 'hidden',
                background: 'var(--black-card)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {renderCartContent()}
            </div>
          </div>
        </Portal>
      )}

      {/* Note Modal */}
      {noteTarget && (
        <Portal>
          <div className="modal-overlay" onClick={() => setNoteTarget(null)} style={{ zIndex: 400 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Add Special Note</h3>
              <input className="input" placeholder="e.g. Extra hot, no sugar, well done..." value={tempNote} onChange={e => setTempNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNote(noteTarget!)} autoFocus />
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => saveNote(noteTarget!)}>Save Note</button>
                <button className="btn btn-ghost" onClick={() => setNoteTarget(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
