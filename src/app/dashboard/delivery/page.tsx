'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Bike, ShoppingBag, Plus, RefreshCw, Printer, Search, Phone,
  MapPin, FileText, CheckCircle, Clock, DollarSign, X, AlertCircle,
  ChefHat, CreditCard, ChevronRight, Minus, Trash2, ArrowLeft, ArrowRight
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import Portal from '@/components/Portal'
import ReceiptVerifier from '@/components/ReceiptVerifier'

interface MenuItem {
  id: string
  name: string
  price: number
  stockQuantity: number
  category?: { id: string; name: string; type: string } | null
}

interface Category {
  id: string
  name: string
  type: string
  menuItems?: MenuItem[]
}

interface OrderItem {
  id: string
  quantity: number
  notes?: string | null
  status: string
  menuItem: {
    id: string
    name: string
    price: number
    category?: { name: string; type: string } | null
  }
}

interface DeliveryOrder {
  id: string
  status: string // 'OPEN' | 'PAID' | 'CANCELLED'
  createdAt: string
  table: { id: string; number: string }
  waiter: { id: string; fullName: string; username: string }
  orderItems: OrderItem[]
  payment?: {
    id: string
    amount: number
    method: string
    discount: number
    cashier?: { fullName: string }
  } | null
}

interface CartItem {
  menuItem: MenuItem
  quantity: number
  notes: string
}

export default function DeliveryPage() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'PAID'>('OPEN')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DELIVERY' | 'TAKEAWAY'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Date filter — default to present day only
  const todayStr = new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(todayStr)
  const [dateTo, setDateTo] = useState(todayStr)

  // Modals
  const [showNewModal, setShowNewModal] = useState(false)
  const [newOrderType, setNewOrderType] = useState<'DELIVERY' | 'TAKEAWAY'>('DELIVERY')
  const [mobileTab, setMobileTab] = useState<'MENU' | 'CART'>('MENU')
  const [orderToPay, setOrderToPay] = useState<DeliveryOrder | null>(null)

  // Menu data for creating order
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string>('ALL')
  const [menuSearch, setMenuSearch] = useState('')

  // New order form fields
  const [orderName, setOrderName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [creatingOrder, setCreatingOrder] = useState(false)

  // Payment form fields
  const [payMethod, setPayMethod] = useState('Cash')
  const [discountValue, setDiscountValue] = useState('')
  const [tipValue, setTipValue] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paying, setPaying] = useState(false)

  // Current session user
  const [sessionUser, setSessionUser] = useState<{ id: string; fullName: string; role: string } | null>(null)

  // Load delivery orders
  const loadOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      const res = await fetch(`/api/delivery-orders?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data)
      } else {
        console.error('Failed to load delivery orders:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading delivery orders:', err)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [dateFrom, dateTo])

  // Load menu items & categories for ordering
  const loadMenuData = useCallback(async () => {
    try {
      const [catRes, itemRes, sessRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/menu-items'),
        fetch('/api/auth/me'),
      ])
      if (catRes.ok) setCategories(await catRes.json())
      if (itemRes.ok) setMenuItems(await itemRes.json())
      if (sessRes.ok) setSessionUser(await sessRes.json())
    } catch (err) {
      console.warn('Error loading menu data:', err)
    }
  }, [])

  useEffect(() => {
    loadOrders()
    loadMenuData()

    // 30s auto-refresh
    const interval = setInterval(() => loadOrders(false), 30000)

    const handleSync = () => loadOrders(false)
    window.addEventListener('sync-complete', handleSync)
    window.addEventListener('cloud-pull-complete', handleSync)

    return () => {
      clearInterval(interval)
      window.removeEventListener('sync-complete', handleSync)
      window.removeEventListener('cloud-pull-complete', handleSync)
    }
  }, [loadOrders, loadMenuData])

  // Manual sync trigger
  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync', { method: 'POST' })
    } catch (err) {
      console.warn('Sync error:', err)
    } finally {
      await loadOrders(false)
      setSyncing(false)
    }
  }

  // Parse order details from table.number and notes
  const parseDeliveryMeta = (tableNumber: string, items: OrderItem[]) => {
    const isTakeaway = tableNumber.toLowerCase().startsWith('takeaway')
    const typeLabel = isTakeaway ? 'TAKEAWAY' : 'DELIVERY'
    
    // table.number format: "Delivery: Abebe (0911234567) #104" or "Takeaway: Sara #105"
    let cleanName = tableNumber.replace(/^(Delivery:|Takeaway:)\s*/i, '').replace(/#.*$/, '').trim()
    let extractedPhone = ''

    const phoneMatch = cleanName.match(/\(([^)]+)\)/)
    if (phoneMatch) {
      extractedPhone = phoneMatch[1]
      cleanName = cleanName.replace(/\([^)]+\)/, '').trim()
    }

    // Extract address & delivery notes from the first item note if formatted as [📍 Address | 📝 Notes]
    let extractedAddress = ''
    let extractedNotes = ''
    const firstItemNote = items[0]?.notes || ''
    const metaMatch = firstItemNote.match(/\[(.*?)\]/)
    if (metaMatch) {
      const parts = metaMatch[1].split('|').map(s => s.trim())
      for (const part of parts) {
        if (part.startsWith('📍')) extractedAddress = part.replace('📍', '').trim()
        if (part.startsWith('📝')) extractedNotes = part.replace('📝', '').trim()
      }
    }

    return {
      type: typeLabel,
      orderName: cleanName || 'Customer',
      phone: extractedPhone,
      address: extractedAddress,
      deliveryNotes: extractedNotes,
    }
  }

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const meta = parseDeliveryMeta(order.table.number, order.orderItems)

      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false
      if (typeFilter !== 'ALL' && meta.type !== typeFilter) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = meta.orderName.toLowerCase().includes(q)
        const matchPhone = meta.phone.toLowerCase().includes(q)
        const matchAddress = meta.address.toLowerCase().includes(q)
        const matchItems = order.orderItems.some(i => i.menuItem.name.toLowerCase().includes(q))
        if (!matchName && !matchPhone && !matchAddress && !matchItems) return false
      }

      return true
    })
  }, [orders, statusFilter, typeFilter, searchQuery])

  // Cart operations
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id)
      if (existing) {
        return prev.map(c => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { menuItem: item, quantity: 1, notes: '' }]
    })
    toast.success(`Added ${item.name}`, 1000)
  }

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev =>
      prev
        .map(c => c.menuItem.id === id ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c)
        .filter(c => c.quantity > 0)
    )
  }

  const cartSubtotal = cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0)

  const openNewOrderModal = (type: 'DELIVERY' | 'TAKEAWAY') => {
    setNewOrderType(type)
    setMobileTab('MENU')
    setShowNewModal(true)
    if (menuItems.length === 0) {
      loadMenuData()
    }
  }

  // Submit new delivery / takeaway order
  const handleCreateOrder = async (andPrint = false) => {
    if (!orderName.trim()) {
      toast.warning('Please enter the customer / order name')
      return
    }
    if (cart.length === 0) {
      toast.warning('Please add at least one item to the order')
      return
    }

    setCreatingOrder(true)
    try {
      const res = await fetch('/api/delivery-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: newOrderType,
          orderName: orderName.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
          items: cart.map(c => ({
            menuItemId: c.menuItem.id,
            quantity: c.quantity,
            notes: c.notes.trim() || undefined,
          })),
        }),
      })

      if (res.ok) {
        const createdOrder: DeliveryOrder = await res.json()
        toast.success(`${newOrderType === 'DELIVERY' ? 'Delivery' : 'Takeaway'} order created!`)
        
        // Reset form
        setOrderName('')
        setPhone('')
        setAddress('')
        setDeliveryNotes('')
        setCart([])
        setShowNewModal(false)

        await loadOrders(false)

        if (andPrint) {
          printCustomerReceipt(createdOrder)
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.error || 'Failed to create order')
      }
    } catch (err) {
      console.error(err)
      toast.error('Network error creating delivery order')
    } finally {
      setCreatingOrder(false)
    }
  }

  // Payment handler
  const handleProcessPayment = async () => {
    if (!orderToPay) return
    const activeItems = orderToPay.orderItems.filter(i => i.status !== 'CANCELLED')
    const subtotal = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
    const discount = parseFloat(discountValue) || 0
    const tip = parseFloat(tipValue) || 0
    const isTransfer = payMethod === 'CBE' || payMethod === 'Telebirr'
    const finalAmount = Math.max(0, subtotal - discount + (isTransfer ? tip : 0))
    const notesWithTip = tip > 0 && isTransfer
      ? (payNotes ? `${payNotes} [Tip: ${tip.toFixed(2)} ETB]` : `[Tip: ${tip.toFixed(2)} ETB]`)
      : payNotes

    setPaying(true)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderToPay.id,
          cashierId: sessionUser?.id,
          amount: finalAmount,
          method: payMethod,
          discount,
          discountType: 'fixed',
          notes: notesWithTip.trim() || undefined,
        }),
      })

      if (res.ok) {
        toast.success(`Payment settled (${payMethod}: ${finalAmount.toFixed(2)} ETB)`)
        setOrderToPay(null)
        setDiscountValue('')
        setTipValue('')
        setPayNotes('')
        await loadOrders(false)
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.error || 'Failed to process payment')
      }
    } catch {
      toast.error('Network error processing payment')
    } finally {
      setPaying(false)
    }
  }

  // ── Print Delivery / Customer Receipt ─────────────────────────────────────────
  const printCustomerReceipt = (order: DeliveryOrder) => {
    const meta = parseDeliveryMeta(order.table.number, order.orderItems)
    const activeItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
    const subtotal = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
    const discount = order.payment?.discount || 0
    const totalAmount = order.payment?.amount || Math.max(0, subtotal - discount)
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })

    const win = window.open('', '_blank', 'width=380,height=650')
    if (!win) {
      toast.warning('Please allow popups to print ticket')
      return
    }

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${meta.type} Receipt - ${meta.orderName}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          *, *:before, *:after { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 12px 14px;
            font-family: 'Courier New', Courier, monospace;
            width: 100%;
            font-size: 13px;
            color: #000;
            background: #fff;
            line-height: 1.35;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .title { font-size: 16px; font-weight: 900; letter-spacing: 1.5px; }
          .type-badge {
            display: inline-block;
            border: 2px solid #000;
            padding: 4px 14px;
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 1px;
            margin: 6px 0;
          }
          .box {
            border: 1px dashed #000;
            padding: 8px 10px;
            margin: 8px 0;
            background: #fbfbfb;
          }
          hr {
            border: none;
            border-top: 1px dashed #000;
            margin: 8px 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
          }
          .item-note {
            font-size: 11px;
            color: #333;
            padding-left: 12px;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">MEBA TECH PRO POS</div>
          <div style="font-size: 11px; margin-top: 2px;">Diva Addis Coffee & Lounge</div>
          <div class="type-badge">${meta.type === 'DELIVERY' ? '🛵 DELIVERY ORDER' : '🥡 TAKEAWAY ORDER'}</div>
        </div>

        <div class="box">
          <div style="font-size: 15px; font-weight: 900;">ORDER NAME: ${meta.orderName}</div>
          ${meta.phone ? `<div><b>Phone:</b> ${meta.phone}</div>` : ''}
          ${meta.address ? `<div><b>Address:</b> ${meta.address}</div>` : ''}
          ${meta.deliveryNotes ? `<div><b>Instructions:</b> ${meta.deliveryNotes}</div>` : ''}
        </div>

        <div style="font-size: 12px;">
          <div><b>Server:</b> ${order.waiter?.fullName || 'Staff'}</div>
          <div><b>Time:</b> ${now}</div>
          <div><b>Status:</b> ${order.status === 'PAID' ? `PAID (${order.payment?.method || 'Cash'})` : 'UNPAID (Pending Payment)'}</div>
        </div>

        <hr/>
        <div class="bold" style="font-size: 12px; margin-bottom: 6px;">ORDERED ITEMS:</div>
        ${activeItems.map(item => {
          const itemNoteClean = item.notes?.replace(/\[.*?\]/, '').trim()
          return `
            <div style="margin-bottom: 6px;">
              <div class="row">
                <span class="bold">${item.quantity}x ${item.menuItem.name}</span>
                <span>${(item.menuItem.price * item.quantity).toFixed(2)} ETB</span>
              </div>
              ${itemNoteClean ? `<div class="item-note">Note: ${itemNoteClean}</div>` : ''}
            </div>
          `
        }).join('')}

        <hr/>
        ${discount > 0 ? `
          <div class="row">
            <span>Subtotal:</span>
            <span>${subtotal.toFixed(2)} ETB</span>
          </div>
          <div class="row">
            <span>Discount:</span>
            <span>-${discount.toFixed(2)} ETB</span>
          </div>
        ` : ''}
        <div class="row bold" style="font-size: 15px; margin-top: 4px;">
          <span>TOTAL:</span>
          <span>${totalAmount.toFixed(2)} ETB</span>
        </div>

        <hr/>
        <div class="center" style="font-size: 11px; margin-top: 10px;">
          <div>Thank you for ordering with us!</div>
          <div style="font-size: 9px; margin-top: 4px; color: #555;">MEBA TECH PRO POS</div>
        </div>
      </body>
      </html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  // ── Print Kitchen Prep Slip ──────────────────────────────────────────────────
  const printKitchenSlip = (order: DeliveryOrder) => {
    const meta = parseDeliveryMeta(order.table.number, order.orderItems)
    const foodItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
    const now = new Date().toLocaleString('en-ET', { timeZone: 'Africa/Addis_Ababa' })

    const win = window.open('', '_blank', 'width=380,height=550')
    if (!win) {
      toast.warning('Please allow popups to print ticket')
      return
    }

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kitchen Prep - ${meta.orderName}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          *, *:before, *:after { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 12px 14px;
            font-family: 'Courier New', Courier, monospace;
            width: 100%;
            font-size: 14px;
            color: #000;
            background: #fff;
            font-weight: bold;
          }
          .center { text-align: center; }
          hr { border: none; border-top: 2px dashed #000; margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="center">
          <div style="font-size: 16px; letter-spacing: 1px;">🍳 KITCHEN PREP TICKET</div>
          <div style="border: 2px solid #000; display: inline-block; padding: 4px 12px; margin: 6px 0; font-size: 15px;">
            ${meta.type === 'DELIVERY' ? '🛵 DELIVERY' : '🥡 TAKEAWAY'}
          </div>
        </div>
        <hr/>
        <div style="font-size: 16px; margin: 6px 0;">
          ORDER NAME: <span style="background: #000; color: #fff; padding: 1px 6px;">${meta.orderName}</span>
        </div>
        <div style="font-size: 12px;">
          <div><b>Server:</b> ${order.waiter?.fullName || 'Staff'}</div>
          <div><b>Time:</b> ${now}</div>
          ${meta.deliveryNotes ? `<div style="margin-top: 4px; color: #333;"><b>Special Prep:</b> ${meta.deliveryNotes}</div>` : ''}
        </div>
        <hr/>
        <div style="font-size: 13px; margin-bottom: 8px;">ITEMS TO PREPARE:</div>
        ${foodItems.map(item => {
          const itemNoteClean = item.notes?.replace(/\[.*?\]/, '').trim()
          return `
            <div style="margin-bottom: 8px; font-size: 15px;">
              <div>[  ] <b>${item.quantity}x</b> ${item.menuItem.name}</div>
              ${itemNoteClean ? `<div style="font-size: 12px; color: #444; padding-left: 20px;">>>> NOTE: ${itemNoteClean}</div>` : ''}
            </div>
          `
        }).join('')}
        <hr/>
        <div class="center" style="font-size: 11px;">— Ready for Packing —</div>
      </body>
      </html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  // Filtered menu items for order creation dialog
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      if (activeCategoryId !== 'ALL' && item.category?.id !== activeCategoryId) return false
      if (menuSearch.trim()) {
        const q = menuSearch.toLowerCase()
        const matchName = item.name.toLowerCase().includes(q)
        const matchCat = item.category?.name?.toLowerCase().includes(q)
        if (!matchName && !matchCat) return false
      }
      return true
    })
  }, [menuItems, activeCategoryId, menuSearch])

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(201,168,76,0.2) 0%, rgba(201,168,76,0.05) 100%)',
              border: '1px solid rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--gold)'
            }}>
              <Bike size={22} />
            </div>
            <div>
              <h1 className="font-cinzel" style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
                <span className="gold-text">Delivery & Takeaway</span>
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '2px 0 0 0' }}>
                Create, track, and print pickup and delivery tickets
              </p>
            </div>
          </div>
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

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleSyncNow}
            disabled={syncing || loading}
            title="Sync delivery orders"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            <span style={{ marginLeft: '4px' }}>{syncing ? 'Syncing...' : 'Sync'}</span>
          </button>

          <button
            className="btn btn-outline btn-sm"
            onClick={() => openNewOrderModal('TAKEAWAY')}
          >
            <ShoppingBag size={15} />
            <span>+ New Takeaway</span>
          </button>

          <button
            className="btn btn-gold btn-sm"
            onClick={() => openNewOrderModal('DELIVERY')}
          >
            <Bike size={15} />
            <span>+ New Delivery</span>
          </button>
        </div>
      </div>

      {/* ── Filters & Search Bar ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '20px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['OPEN', 'PAID', 'ALL'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`btn btn-sm ${statusFilter === st ? 'btn-gold' : 'btn-ghost'}`}
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                {st === 'OPEN' ? '🔥 Active / Open' : st === 'PAID' ? '✅ Completed / Paid' : 'All Orders'}
              </button>
            ))}
          </div>

          {/* Type Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['ALL', 'DELIVERY', 'TAKEAWAY'] as const).map(tp => (
              <button
                key={tp}
                onClick={() => setTypeFilter(tp)}
                className={`btn btn-sm ${typeFilter === tp ? 'btn-outline' : 'btn-ghost'}`}
                style={{
                  fontSize: '12px', padding: '6px 12px',
                  borderColor: typeFilter === tp ? 'var(--gold)' : 'transparent',
                  color: typeFilter === tp ? 'var(--gold)' : 'var(--text-secondary)'
                }}
              >
                {tp === 'ALL' ? 'All Types' : tp === 'DELIVERY' ? '🛵 Delivery' : '🥡 Takeaway'}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '320px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search customer, phone, item..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input"
              style={{ width: '100%', paddingLeft: '32px', fontSize: '13px', height: '36px' }}
            />
          </div>
        </div>
      </div>

      {/* ── Order List / Cards ──────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--gold)' }}>
          <RefreshCw className="animate-spin" size={36} style={{ margin: '0 auto 16px' }} />
          <div className="font-cinzel" style={{ fontSize: '16px' }}>Loading Delivery & Takeaway Orders...</div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🛵</div>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '17px', fontWeight: '600', marginBottom: '6px' }}>
            No Delivery or Takeaway Orders Found
          </h3>
          <p style={{ fontSize: '13px', maxWidth: '360px', margin: '0 auto 18px' }}>
            {searchQuery ? 'Try adjusting your search criteria.' : 'Create your first delivery or takeaway order using the buttons above.'}
          </p>
          <button
            className="btn btn-gold btn-sm"
            onClick={() => openNewOrderModal('DELIVERY')}
          >
            <Plus size={14} /> Create Order Now
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredOrders.map(order => {
            const meta = parseDeliveryMeta(order.table.number, order.orderItems)
            const activeItems = order.orderItems.filter(i => i.status !== 'CANCELLED')
            const total = activeItems.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
            const isOpen = order.status === 'OPEN'

            return (
              <div
                key={order.id}
                className="card"
                style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  border: isOpen ? '1px solid rgba(201,168,76,0.35)' : '1px solid var(--black-border)',
                  background: isOpen ? 'linear-gradient(180deg, rgba(201,168,76,0.04) 0%, rgba(20,20,20,0.6) 100%)' : 'var(--black-card)',
                  boxShadow: isOpen ? '0 4px 20px rgba(0,0,0,0.4)' : 'none',
                  borderRadius: '12px', padding: '16px', position: 'relative'
                }}
              >
                <div>
                  {/* Top Bar: Type + Status Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                      letterSpacing: '0.5px',
                      background: meta.type === 'DELIVERY' ? 'rgba(56,189,248,0.12)' : 'rgba(249,115,22,0.12)',
                      color: meta.type === 'DELIVERY' ? '#38bdf8' : '#f97316',
                      border: `1px solid ${meta.type === 'DELIVERY' ? 'rgba(56,189,248,0.3)' : 'rgba(249,115,22,0.3)'}`
                    }}>
                      {meta.type === 'DELIVERY' ? <Bike size={13} /> : <ShoppingBag size={13} />}
                      <span>{meta.type}</span>
                    </div>

                    <span className={`badge ${isOpen ? 'badge-open' : order.status === 'PAID' ? 'badge-paid' : 'badge-cancelled'}`} style={{ fontSize: '11px' }}>
                      {isOpen ? '● Active' : order.status}
                    </span>
                  </div>

                  {/* Order Name / Customer */}
                  <div style={{ marginBottom: '8px' }}>
                    <h3 style={{
                      fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)',
                      margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                      <span className="gold-text">{meta.orderName}</span>
                    </h3>

                    {/* Contact & Address */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {meta.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Phone size={13} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                          <a href={`tel:${meta.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {meta.phone}
                          </a>
                        </div>
                      )}
                      {meta.address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={13} style={{ color: '#38bdf8', flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-primary)' }}>{meta.address}</span>
                        </div>
                      )}
                      {meta.deliveryNotes && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                          <FileText size={13} style={{ flexShrink: 0 }} />
                          <span>{meta.deliveryNotes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Server & Time Info */}
                  <div style={{
                    fontSize: '11px', color: 'var(--text-muted)',
                    display: 'flex', justifyContent: 'space-between',
                    padding: '6px 0', borderTop: '1px dashed var(--black-border)', borderBottom: '1px dashed var(--black-border)',
                    marginBottom: '10px'
                  }}>
                    <span>Server: <b style={{ color: 'var(--text-secondary)' }}>{order.waiter?.fullName || 'Staff'}</b></span>
                    <span>{new Date(order.createdAt).toLocaleTimeString('en-ET', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Ordered Items Preview */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Ordered Items ({activeItems.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {activeItems.map(item => {
                        const cleanNote = item.notes?.replace(/\[.*?\]/, '').trim()
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <div style={{ flex: 1, paddingRight: '8px' }}>
                              <span style={{ fontWeight: '600' }}>{item.quantity}x</span> {item.menuItem.name}
                              {cleanNote && (
                                <div style={{ fontSize: '11px', color: 'var(--warning-light)', fontStyle: 'italic', paddingLeft: '8px' }}>
                                  ↳ {cleanNote}
                                </div>
                              )}
                            </div>
                            <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>
                              {(item.menuItem.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Bottom Section: Total & Action Buttons */}
                <div style={{ borderTop: '1px solid var(--black-border)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Amount</span>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>
                      {total.toFixed(2)} <span style={{ fontSize: '12px', fontWeight: '500' }}>ETB</span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {/* Print Customer Ticket */}
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1, minWidth: '90px', padding: '6px 10px', fontSize: '12px' }}
                      onClick={() => printCustomerReceipt(order)}
                      title="Print Customer Delivery Receipt"
                    >
                      <Printer size={14} /> Receipt
                    </button>

                    {/* Print Kitchen Slip */}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                      onClick={() => printKitchenSlip(order)}
                      title="Print Kitchen Preparation Slip"
                    >
                      <ChefHat size={14} /> Kitchen
                    </button>

                    {/* Settle Payment if Open */}
                    {isOpen ? (
                      <button
                        className="btn btn-gold btn-sm"
                        style={{ flex: 1, minWidth: '90px', padding: '6px 10px', fontSize: '12px' }}
                        onClick={() => setOrderToPay(order)}
                      >
                        <CreditCard size={14} /> Pay
                      </button>
                    ) : (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '11px', color: 'var(--success-light)', fontWeight: '600',
                        padding: '6px 10px'
                      }}>
                        <CheckCircle size={14} /> Paid ({order.payment?.method || 'Settled'})
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal: Create Delivery / Takeaway Order ───────────────────────────── */}
      {showNewModal && (
        <Portal>
          <div
            className="modal-overlay"
            onClick={() => setShowNewModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(5, 4, 2, 0.88)',
              backdropFilter: 'blur(8px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
            }}
          >
            <div
              className="delivery-order-dialog"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--black-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--black-card)',
                flexShrink: 0,
                gap: '12px',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    padding: '8px',
                    borderRadius: '8px',
                    background: newOrderType === 'DELIVERY' ? 'rgba(56,189,248,0.14)' : 'rgba(249,115,22,0.14)',
                    color: newOrderType === 'DELIVERY' ? '#38bdf8' : '#f97316'
                  }}>
                    {newOrderType === 'DELIVERY' ? <Bike size={20} /> : <ShoppingBag size={20} />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>New {newOrderType === 'DELIVERY' ? 'Delivery' : 'Takeaway'} Order</span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 7px',
                        borderRadius: '12px',
                        background: newOrderType === 'DELIVERY' ? 'rgba(56,189,248,0.15)' : 'rgba(249,115,22,0.15)',
                        color: newOrderType === 'DELIVERY' ? '#38bdf8' : '#f97316',
                        fontWeight: '600'
                      }}>
                        {newOrderType}
                      </span>
                    </h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Pick items from the menu, enter customer details, and dispatch
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Order Type Toggle */}
                  <div style={{
                    display: 'flex', background: 'var(--black-surface)',
                    padding: '3px', borderRadius: '8px', border: '1px solid var(--black-border)'
                  }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${newOrderType === 'DELIVERY' ? 'btn-gold' : 'btn-ghost'}`}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                      onClick={() => setNewOrderType('DELIVERY')}
                    >
                      <Bike size={13} /> Delivery
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${newOrderType === 'TAKEAWAY' ? 'btn-gold' : 'btn-ghost'}`}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                      onClick={() => setNewOrderType('TAKEAWAY')}
                    >
                      <ShoppingBag size={13} /> Takeaway
                    </button>
                  </div>

                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '6px', borderRadius: '8px' }}
                    onClick={() => setShowNewModal(false)}
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Mobile / Tablet Tab Switcher (Visible only on <= 860px) */}
              <div className="delivery-mobile-tabs" style={{
                borderBottom: '1px solid var(--black-border)',
                background: 'var(--black-surface)',
                display: 'flex',
              }}>
                <button
                  type="button"
                  onClick={() => setMobileTab('MENU')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: mobileTab === 'MENU' ? 'rgba(201,168,76,0.12)' : 'transparent',
                    color: mobileTab === 'MENU' ? 'var(--gold)' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: mobileTab === 'MENU' ? '2px solid var(--gold)' : '2px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🍽️ 1. Select Menu Items</span>
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: mobileTab === 'MENU' ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                    color: mobileTab === 'MENU' ? 'var(--black)' : 'inherit',
                    fontSize: '11px',
                    fontWeight: '700',
                  }}>
                    {cart.reduce((s, c) => s + c.quantity, 0)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab('CART')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: mobileTab === 'CART' ? 'rgba(201,168,76,0.12)' : 'transparent',
                    color: mobileTab === 'CART' ? 'var(--gold)' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: mobileTab === 'CART' ? '2px solid var(--gold)' : '2px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <span>📋 2. Order Details &amp; Cart</span>
                  {cartSubtotal > 0 && (
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: 'rgba(201,168,76,0.2)',
                      color: 'var(--gold)',
                      fontSize: '11px',
                      fontWeight: '700',
                    }}>
                      {cartSubtotal.toFixed(0)} ETB
                    </span>
                  )}
                </button>
              </div>

              {/* Modal Body: Left column (Menu Items) + Right column (Customer & Cart) */}
              <div className="delivery-modal-body">
                {/* ── Left Column: Menu Items Selector ────────────────────────────── */}
                <div
                  className="delivery-col-menu"
                  style={{
                    display: mobileTab === 'MENU' ? 'flex' : 'none',
                    flexDirection: 'column',
                    minHeight: 0,
                    height: '100%',
                    position: 'relative',
                  }}
                >
                  {/* Search and Category Pills */}
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--black-border)', flexShrink: 0 }}>
                    <div style={{ position: 'relative', marginBottom: '8px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        placeholder="Search menu items by name or category..."
                        value={menuSearch}
                        onChange={e => setMenuSearch(e.target.value)}
                        className="input"
                        style={{ width: '100%', paddingLeft: '32px', fontSize: '13px', height: '34px' }}
                      />
                      {menuSearch && (
                        <button
                          type="button"
                          onClick={() => setMenuSearch('')}
                          style={{
                            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                            background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Category Selector */}
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${activeCategoryId === 'ALL' ? 'btn-gold' : 'btn-ghost'}`}
                        style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                        onClick={() => setActiveCategoryId('ALL')}
                      >
                        All ({menuItems.length})
                      </button>
                      {categories.map(cat => {
                        const count = menuItems.filter(i => i.category?.id === cat.id).length
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            className={`btn btn-sm ${activeCategoryId === cat.id ? 'btn-gold' : 'btn-ghost'}`}
                            style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                            onClick={() => setActiveCategoryId(cat.id)}
                          >
                            {cat.name} ({count})
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Menu Items Grid */}
                  <div style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: '12px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                    gap: '10px',
                    alignContent: 'start',
                  }}>
                    {filteredMenuItems.length === 0 ? (
                      <div style={{
                        gridColumn: '1 / -1',
                        textAlign: 'center',
                        padding: '48px 16px',
                        color: 'var(--text-muted)'
                      }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🍽️</div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                          No menu items found
                        </div>
                        <p style={{ fontSize: '11px', marginTop: '4px', maxWidth: '280px', margin: '4px auto 12px' }}>
                          {menuSearch ? 'Try a different search keyword.' : 'No items found in this category.'}
                        </p>
                        {activeCategoryId !== 'ALL' && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '11px', padding: '4px 12px' }}
                            onClick={() => setActiveCategoryId('ALL')}
                          >
                            Show All Items
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredMenuItems.map(item => {
                        const inCart = cart.find(c => c.menuItem.id === item.id)
                        return (
                          <div
                            key={item.id}
                            onClick={() => addToCart(item)}
                            style={{
                              background: inCart ? 'rgba(201,168,76,0.08)' : 'var(--black-card)',
                              border: inCart ? '1.5px solid var(--gold)' : '1px solid var(--black-border)',
                              borderRadius: '10px', padding: '10px', cursor: 'pointer',
                              transition: 'all 0.15s ease', display: 'flex', flexDirection: 'column',
                              justifyContent: 'space-between', minHeight: '80px', position: 'relative'
                            }}
                            onMouseEnter={e => {
                              if (!inCart) e.currentTarget.style.borderColor = 'var(--gold)'
                              e.currentTarget.style.transform = 'translateY(-2px)'
                            }}
                            onMouseLeave={e => {
                              if (!inCart) e.currentTarget.style.borderColor = 'var(--black-border)'
                              e.currentTarget.style.transform = 'translateY(0)'
                            }}
                          >
                            {inCart && (
                              <div style={{
                                position: 'absolute', top: '6px', right: '6px',
                                background: 'var(--gold)', color: 'var(--black)',
                                borderRadius: '50%', width: '20px', height: '20px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: '800'
                              }}>
                                {inCart.quantity}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: '600', fontSize: '12px', color: 'var(--text-primary)', marginBottom: '2px', paddingRight: inCart ? '20px' : '0' }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {item.category?.name || 'Item'}
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                              <span style={{ color: 'var(--gold)', fontWeight: '700', fontSize: '12px' }}>
                                {item.price.toFixed(2)} ETB
                              </span>
                              <span style={{
                                width: '20px', height: '20px', borderRadius: '50%',
                                background: inCart ? 'var(--gold)' : 'rgba(201,168,76,0.15)',
                                color: inCart ? 'var(--black)' : 'var(--gold)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700'
                              }}>+</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Mobile Sticky Proceed Button (Only visible on mobile when items in cart) */}
                  {cart.length > 0 && (
                    <div
                      className="delivery-mobile-bottom-bar"
                      style={{
                        padding: '10px 14px',
                        borderTop: '1px solid var(--black-border)',
                        background: 'linear-gradient(135deg, #241C0E 0%, #1A1408 100%)',
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-gold btn-sm"
                        style={{ width: '100%', padding: '10px', justifyContent: 'space-between', fontSize: '13px' }}
                        onClick={() => setMobileTab('CART')}
                      >
                        <span>🛒 {cart.reduce((s, c) => s + c.quantity, 0)} item(s) · {cartSubtotal.toFixed(2)} ETB</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Review &amp; Place Order <ArrowRight size={14} />
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Right Column: Order Details & Cart ──────────────────────────── */}
                <div
                  className="delivery-col-cart"
                  style={{
                    display: mobileTab === 'CART' ? 'flex' : 'none',
                    flexDirection: 'column',
                    minHeight: 0,
                    height: '100%',
                    background: 'var(--black-surface)',
                  }}
                >
                  {/* Mobile Back to Menu Banner */}
                  <div
                    className="delivery-mobile-tabs"
                    style={{
                      padding: '8px 14px',
                      background: 'rgba(201,168,76,0.06)',
                      borderBottom: '1px solid var(--black-border)',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--gold)' }}
                      onClick={() => setMobileTab('MENU')}
                    >
                      <ArrowLeft size={13} /> Add More Items
                    </button>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {cart.reduce((s, c) => s + c.quantity, 0)} item(s) selected
                    </span>
                  </div>

                  {/* Order Details Form */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--black-border)', flexShrink: 0 }}>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '600', marginBottom: '3px', color: 'var(--gold)' }}>
                        <span>Customer / Order Name *</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Required</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Abebe Kebede, Room 302, Dawit..."
                        value={orderName}
                        onChange={e => setOrderName(e.target.value)}
                        className="input"
                        style={{ width: '100%', fontSize: '12px', height: '34px' }}
                        autoFocus
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', marginBottom: '3px', color: 'var(--text-secondary)' }}>
                          Phone Number
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 0911234567"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          className="input"
                          style={{ width: '100%', fontSize: '12px', height: '32px' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', marginBottom: '3px', color: 'var(--text-secondary)' }}>
                          {newOrderType === 'DELIVERY' ? 'Delivery Address' : 'Pickup Time / Note'}
                        </label>
                        <input
                          type="text"
                          placeholder={newOrderType === 'DELIVERY' ? 'e.g. Bole Medhanialem' : 'e.g. In 20 mins, pickup'}
                          value={address}
                          onChange={e => setAddress(e.target.value)}
                          className="input"
                          style={{ width: '100%', fontSize: '12px', height: '32px' }}
                        />
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="Delivery notes / prep instructions (e.g. extra napkins, call driver)..."
                        value={deliveryNotes}
                        onChange={e => setDeliveryNotes(e.target.value)}
                        className="input"
                        style={{ width: '100%', fontSize: '11px', height: '30px' }}
                      />
                    </div>
                  </div>

                  {/* Cart Items List */}
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Order Items ({cart.reduce((s, c) => s + c.quantity, 0)})
                      </div>
                      {cart.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '10px', padding: '2px 6px', color: 'var(--danger-light)' }}
                          onClick={() => setCart([])}
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    {cart.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '36px 14px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '28px', marginBottom: '6px' }}>🛒</div>
                        <div style={{ fontSize: '12px', fontWeight: '500' }}>Your order cart is empty</div>
                        <p style={{ fontSize: '11px', marginTop: '2px' }}>
                          Select items from the menu to add to this order
                        </p>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm delivery-mobile-tabs"
                          style={{ margin: '10px auto 0', fontSize: '11px' }}
                          onClick={() => setMobileTab('MENU')}
                        >
                          Browse Menu Items
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {cart.map(item => (
                          <div
                            key={item.menuItem.id}
                            style={{
                              background: 'var(--black-card)', border: '1px solid var(--black-border)',
                              borderRadius: '8px', padding: '8px 10px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '600', fontSize: '12px' }}>{item.menuItem.name}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: '700', color: 'var(--gold)', fontSize: '12px' }}>
                                  {(item.menuItem.price * item.quantity).toFixed(2)} ETB
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '2px', color: 'var(--danger-light)', minWidth: 'auto', height: 'auto' }}
                                  onClick={() => setCart(prev => prev.filter(c => c.menuItem.id !== item.menuItem.id))}
                                  title="Remove item"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', gap: '8px' }}>
                              {/* Quantity Stepper */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--black-surface)', padding: '2px 4px', borderRadius: '6px', border: '1px solid var(--black-border)' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '2px 5px', height: '22px', minWidth: '22px' }}
                                  onClick={() => updateCartQty(item.menuItem.id, -1)}
                                >
                                  <Minus size={11} />
                                </button>
                                <span style={{ fontWeight: '700', fontSize: '12px', minWidth: '18px', textAlign: 'center' }}>{item.quantity}</span>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '2px 5px', height: '22px', minWidth: '22px' }}
                                  onClick={() => updateCartQty(item.menuItem.id, 1)}
                                >
                                  <Plus size={11} />
                                </button>
                              </div>

                              {/* Item Note Input */}
                              <input
                                type="text"
                                placeholder="Special item note..."
                                value={item.notes}
                                onChange={e => {
                                  const val = e.target.value
                                  setCart(prev => prev.map(c => c.menuItem.id === item.menuItem.id ? { ...c, notes: val } : c))
                                }}
                                className="input"
                                style={{ fontSize: '11px', height: '26px', flex: 1 }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cart Footer */}
                  <div style={{ padding: '12px 16px', borderTop: '1px solid var(--black-border)', background: 'var(--black-card)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Order Total ({cart.reduce((s, c) => s + c.quantity, 0)} items):
                      </span>
                      <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--gold)' }}>
                        {cartSubtotal.toFixed(2)} ETB
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '8px 12px', fontSize: '12px' }}
                        onClick={() => setShowNewModal(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12px' }}
                        onClick={() => handleCreateOrder(false)}
                        disabled={creatingOrder || cart.length === 0}
                      >
                        Create Only
                      </button>
                      <button
                        type="button"
                        className="btn btn-gold btn-sm"
                        style={{ flex: 1.3, padding: '8px 12px', fontSize: '12px' }}
                        onClick={() => handleCreateOrder(true)}
                        disabled={creatingOrder || cart.length === 0}
                      >
                        <Printer size={13} /> {creatingOrder ? 'Saving...' : 'Create & Print'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Modal: Settle Payment ────────────────────────────────────────────── */}
      {orderToPay && (
        <Portal>
          <div
            className="modal-overlay"
            onClick={() => setOrderToPay(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(5, 4, 2, 0.88)',
              backdropFilter: 'blur(6px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              className="modal"
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: '440px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid var(--black-border)',
                background: 'var(--black-card)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '700', margin: 0 }}>
                  Settle Delivery Payment
                </h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setOrderToPay(null)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ marginBottom: '16px', background: 'var(--black-surface)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Customer / Order Name:</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--gold)', marginTop: '2px' }}>
                  {parseDeliveryMeta(orderToPay.table.number, orderToPay.orderItems).orderName}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>
                  Payment Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  {['Cash', 'Telebirr', 'CBE'].map(m => (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-sm ${payMethod === m ? 'btn-gold' : 'btn-outline'}`}
                      style={{ fontSize: '12px' }}
                      onClick={() => setPayMethod(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tip for digital payments */}
              {(payMethod === 'Telebirr' || payMethod === 'CBE') && (
                <div style={{ marginBottom: '14px', background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '8px', padding: '10px 12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: 'var(--gold)' }}>
                    💝 Tip (Optional)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00 ETB"
                    value={tipValue}
                    onChange={e => setTipValue(e.target.value)}
                    className="input"
                    style={{ width: '100%' }}
                    min="0"
                    step="5"
                  />
                </div>
              )}

              {/* Official Receipt Verifier */}
              {(() => {
                const sub = orderToPay.orderItems
                  .filter(i => i.status !== 'CANCELLED')
                  .reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
                const disc = parseFloat(discountValue) || 0
                const finalAmt = Math.max(0, sub - disc)

                return (
                  <ReceiptVerifier
                    method={payMethod}
                    expectedAmount={finalAmt}
                    onVerified={(receipt) => {
                      const verifiedTag = `[Verified ${receipt.provider} | Ref: ${receipt.reference}${receipt.payerName ? ` | Payer: ${receipt.payerName}` : ''}]`
                      setPayNotes(prev => prev ? `${prev} ${verifiedTag}` : verifiedTag)
                      toast.success(`Verified official ${receipt.provider} slip: ${receipt.amount ? `${receipt.amount.toFixed(2)} ETB` : 'Confirmed'}`)
                    }}
                    onClear={() => {
                      setPayNotes(prev => prev.replace(/\[Verified[^\]]+\]/g, '').trim())
                    }}
                  />
                )
              })()}

              {/* Discount Input */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                  Discount (ETB)
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                  Payment Reference / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Telebirr transaction code, delivery driver..."
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              {/* Total Calculation */}
              {(() => {
                const sub = orderToPay.orderItems
                  .filter(i => i.status !== 'CANCELLED')
                  .reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
                const disc = parseFloat(discountValue) || 0
                const tip = parseFloat(tipValue) || 0
                const isTransfer = payMethod === 'CBE' || payMethod === 'Telebirr'
                const finalAmt = Math.max(0, sub - disc + (isTransfer ? tip : 0))

                return (
                  <div style={{ padding: '12px', background: 'var(--black-surface)', borderRadius: '8px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                      <span>{sub.toFixed(2)} ETB</span>
                    </div>
                    {disc > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--warning-light)' }}>Discount</span>
                        <span style={{ color: 'var(--warning-light)' }}>-{disc.toFixed(2)} ETB</span>
                      </div>
                    )}
                    {tip > 0 && isTransfer && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--gold)' }}>💝 Tip</span>
                        <span style={{ color: 'var(--gold)' }}>+{tip.toFixed(2)} ETB</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--black-border)' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>Amount to Pay:</span>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--gold)' }}>
                        {finalAmt.toFixed(2)} ETB
                      </span>
                    </div>
                  </div>
                )
              })()}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => setOrderToPay(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-gold"
                  style={{ flex: 1.5 }}
                  onClick={handleProcessPayment}
                  disabled={paying}
                >
                  {paying ? 'Processing...' : 'Confirm & Complete'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
