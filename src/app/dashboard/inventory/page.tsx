'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { AlertTriangle, Plus, Minus, Pencil, Trash2, RefreshCw, Search, Calendar } from 'lucide-react'
import Portal from '@/components/Portal'
import { toast } from '@/components/ToastProvider'

interface Category { id: string; name: string; type: string }
interface MenuItem { id: string; name: string; price: number; stockQuantity: number; barQuantity: number; costPrice: number; lowStockThreshold: number; available: boolean; category?: Category | null; parentItemId?: string | null; unitMultiplier: number; parentItem?: { id: string; name: string } | null; recipes?: any[] }
interface Ingredient { id: string; name: string; unit: string; quantity: number; barQuantity: number; costPerUnit?: number; minThreshold: number }

function getEffectiveItemCost(item: MenuItem): { cost: number; isRecipe: boolean } {
  let recipeCost = 0
  if (Array.isArray(item.recipes) && item.recipes.length > 0) {
    for (const r of item.recipes) {
      recipeCost += Number(r.quantity || 0) * Number(r.ingredient?.costPerUnit || 0)
    }
    recipeCost = Math.round(recipeCost * 100) / 100
  }
  const directCost = Number(item.costPrice || 0)
  const total = recipeCost > 0 ? (directCost + recipeCost) : directCost
  return { cost: Math.round(total * 100) / 100, isRecipe: recipeCost > 0 }
}

const UNITS = ['grams', 'kg', 'ml', 'liters', 'pieces', 'cups', 'tbsp', 'tsp']

export default function InventoryPage() {
  const [tab, setTab] = useState<'drinks' | 'ingredients' | 'logs' | 'waste'>('drinks')
  const [searchQuery, setSearchQuery] = useState('')
  const [session, setSession] = useState<{ id: string; fullName: string; role: string } | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Waste logging state
  const [showWasteModal, setShowWasteModal] = useState(false)
  const [wasteItemType, setWasteItemType] = useState<'ITEM' | 'INGREDIENT'>('ITEM')
  const [wasteSelectedId, setWasteSelectedId] = useState('')
  const [wasteLocation, setWasteLocation] = useState<'STORE' | 'BAR'>('STORE')
  const [wasteQty, setWasteQty] = useState('')
  const [wasteReason, setWasteReason] = useState('Expired / Past Shelf Life')
  const [wasteNotes, setWasteNotes] = useState('')
  const [wasteSubmitting, setWasteSubmitting] = useState(false)
  const [wasteFilterReason, setWasteFilterReason] = useState('ALL')

  // Drink stock state
  const [items, setItems] = useState<MenuItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [adjustTarget, setAdjustTarget] = useState<MenuItem | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustCostPrice, setAdjustCostPrice] = useState('')
  const [transferTarget, setTransferTarget] = useState<MenuItem | null>(null)
  const [transferQty, setTransferQty] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [categories, setCategories] = useState<Category[]>([])

  // Ingredient state
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loadingIngs, setLoadingIngs] = useState(true)
  const [ingSearchQuery, setIngSearchQuery] = useState('')
  const [filterIng, setFilterIng] = useState('')
  const [editIng, setEditIng] = useState<Ingredient | null>(null)
  const [ingForm, setIngForm] = useState({ name: '', unit: 'grams', quantity: '0', barQuantity: '0', costPerUnit: '0', minThreshold: '0' })
  const [showIngForm, setShowIngForm] = useState(false)
  const [ingError, setIngError] = useState('')
  const [adjustIngTarget, setAdjustIngTarget] = useState<Ingredient | null>(null)
  const [adjustIngQty, setAdjustIngQty] = useState('')
  const [adjustIngCost, setAdjustIngCost] = useState('')
  const [adjustIngMode, setAdjustIngMode] = useState<'add' | 'set'>('add')
  const [adjustIngSaving, setAdjustIngSaving] = useState(false)
  const [transferIngTarget, setTransferIngTarget] = useState<Ingredient | null>(null)
  const [transferIngQty, setTransferIngQty] = useState('')
  const [transferIngSaving, setTransferIngSaving] = useState(false)
  
  // Stock logging state
  const [logs, setLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  const [itemsError, setItemsError] = useState<string | null>(null)
  const [ingsError, setIngsError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const hasLoadedItemsRef = useRef(false)
  const hasLoadedIngsRef = useRef(false)
  const hasLoadedLogsRef = useRef(false)

  // Resilient fetch helper with 12s timeout and automatic 1x retry (ideal for absorbing Neon cold starts)
  const fetchWithRetry = useCallback(async (url: string, timeoutMs = 12000): Promise<Response> => {
    const doFetch = async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await fetch(url, { cache: 'no-store', signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
    }

    try {
      const res = await doFetch()
      if (res.ok) return res
      // If server returned 5xx (e.g. Neon cold start wake-up), wait 700ms and retry once
      await new Promise(r => setTimeout(r, 700))
      return await doFetch()
    } catch {
      // If network timed out or failed, wait 700ms and retry once
      await new Promise(r => setTimeout(r, 700))
      return await doFetch()
    }
  }, [])

  const loadItems = useCallback(async (isSilent = false) => {
    if (!isSilent && !hasLoadedItemsRef.current) setLoadingItems(true)
    setItemsError(null)
    try {
      const res = await fetchWithRetry('/api/menu-items')
      if (res.ok) {
        setItems(await res.json())
        hasLoadedItemsRef.current = true
        setItemsError(null)
      } else {
        console.error('Failed to load menu items:', res.statusText)
        if (!hasLoadedItemsRef.current) setItemsError('Failed to load menu items from server')
      }
    } catch (err) {
      console.error('Error loading menu items:', err)
      if (!hasLoadedItemsRef.current) setItemsError('Connection timed out loading items')
    } finally {
      setLoadingItems(false)
    }
  }, [fetchWithRetry])

  const loadIngredients = useCallback(async (isSilent = false) => {
    if (!isSilent && !hasLoadedIngsRef.current) setLoadingIngs(true)
    setIngsError(null)
    try {
      const res = await fetchWithRetry('/api/ingredients')
      if (res.ok) {
        setIngredients(await res.json())
        hasLoadedIngsRef.current = true
        setIngsError(null)
      } else {
        console.error('Failed to load ingredients:', res.statusText)
        if (!hasLoadedIngsRef.current) setIngsError('Failed to load ingredients from server')
      }
    } catch (err) {
      console.error('Error loading ingredients:', err)
      if (!hasLoadedIngsRef.current) setIngsError('Connection timed out loading ingredients')
    } finally {
      setLoadingIngs(false)
    }
  }, [fetchWithRetry])

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetchWithRetry('/api/categories')
      if (res.ok) {
        setCategories(await res.json())
      } else {
        console.error('Failed to load categories:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }, [fetchWithRetry])

  const loadLogs = useCallback(async (isSilent = false) => {
    if (!isSilent && !hasLoadedLogsRef.current) setLoadingLogs(true)
    try {
      const res = await fetchWithRetry('/api/inventory/logs')
      if (res.ok) {
        setLogs(await res.json())
        hasLoadedLogsRef.current = true
      } else {
        console.error('Failed to load inventory logs:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading inventory logs:', err)
    } finally {
      setLoadingLogs(false)
    }
  }, [fetchWithRetry])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSession(data) })
      .catch(() => {})

    loadItems()
    loadIngredients()
    loadCategories()
    loadLogs()

    const handleSync = () => {
      loadItems(true)
      loadIngredients(true)
      loadCategories()
      loadLogs(true)
    }

    window.addEventListener('cloud-pull-complete', handleSync)
    window.addEventListener('sync-complete', handleSync)
    const interval = setInterval(handleSync, 20_000)

    return () => {
      window.removeEventListener('cloud-pull-complete', handleSync)
      window.removeEventListener('sync-complete', handleSync)
      clearInterval(interval)
    }
  }, [loadItems, loadIngredients, loadCategories, loadLogs])

  const handleTableWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollWidth > el.clientWidth && !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const atLeft = el.scrollLeft <= 0 && e.deltaY < 0
      const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0
      if (!atLeft && !atRight) {
        el.scrollLeft += e.deltaY
      }
    }
  }

  // Waste logging submit handler
  async function handleLogWaste(e: React.FormEvent) {
    e.preventDefault()
    if (!wasteSelectedId) {
      toast.error('Please select an item or ingredient')
      return
    }
    const qty = parseFloat(wasteQty)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity greater than 0')
      return
    }

    setWasteSubmitting(true)
    try {
      const res = await fetch('/api/inventory/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: wasteItemType,
          itemId: wasteSelectedId,
          location: wasteLocation,
          quantity: qty,
          reason: wasteReason,
          notes: wasteNotes.trim(),
        }),
      })

      if (res.ok) {
        toast.success(`Waste logged: ${qty} discarded (${wasteReason})`)
        setShowWasteModal(false)
        setWasteQty('')
        setWasteNotes('')
        setWasteSelectedId('')
        loadItems(true)
        loadIngredients(true)
        loadLogs(true)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to log waste')
      }
    } catch {
      toast.error('Network error logging waste')
    } finally {
      setWasteSubmitting(false)
    }
  }

  // Drink stock functions
  async function adjustStock(delta: number) {
    setAdjustQty(prev => String(Math.max(0, parseInt(prev || '0') + delta)))
  }

  async function setStockDirect() {
    if (!adjustTarget || !adjustQty) return
    const addedQty = parseInt(adjustQty)
    if (isNaN(addedQty) || addedQty === 0) return

    if (adjustTarget.parentItemId) {
      // Child item (e.g. Jambo): convert and add to parent's store stock
      const parentItem = items.find(i => i.id === adjustTarget.parentItemId)
      if (!parentItem) return
      const convertedQty = addedQty * adjustTarget.unitMultiplier
      const newStock = Math.max(0, parentItem.stockQuantity + convertedQty)
      await fetch(`/api/menu-items/${adjustTarget.parentItemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockQuantity: newStock }),
      })
    } else {
      // Normal item: add directly
      const newStock = Math.max(0, adjustTarget.stockQuantity + addedQty)
      const updateData: Record<string, unknown> = { stockQuantity: newStock }
      if (adjustCostPrice !== '' && !isNaN(parseFloat(adjustCostPrice))) {
        updateData.costPrice = parseFloat(adjustCostPrice)
      }
      await fetch(`/api/menu-items/${adjustTarget.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
    }
    setAdjustTarget(null); setAdjustQty(''); setAdjustCostPrice(''); loadItems(true); loadLogs(true)
  }

  async function handleTransfer(qtyOverride?: number) {
    const qty = qtyOverride !== undefined ? qtyOverride : parseInt(transferQty)
    if (!transferTarget || !qty || isNaN(qty) || qty <= 0) return
    if (qty > transferTarget.stockQuantity) {
      alert(`Cannot transfer ${qty} units. Only ${transferTarget.stockQuantity} available in store.`)
      return
    }
    const res = await fetch(`/api/inventory/transfer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuItemId: transferTarget.id, quantity: qty }),
    })
    if (!res.ok) {
      const { error } = await res.json()
      alert(error || 'Failed to transfer')
      return
    }
    setTransferTarget(null); setTransferQty(''); loadItems(true); loadLogs(true)
  }

  // Ingredient functions
  function openNewIng() {
    setEditIng(null)
    setIngForm({ name: '', unit: 'grams', quantity: '0', barQuantity: '0', costPerUnit: '0', minThreshold: '0' })
    setIngError('')
    setShowIngForm(true)
  }

  function openEditIng(ing: Ingredient) {
    setEditIng(ing)
    setIngForm({
      name: ing.name,
      unit: ing.unit,
      quantity: String(ing.quantity),
      barQuantity: String(ing.barQuantity || 0),
      costPerUnit: String(ing.costPerUnit || 0),
      minThreshold: String(ing.minThreshold),
    })
    setIngError('')
    setShowIngForm(true)
  }

  async function handleTransferIng(qtyOverride?: number) {
    const qty = qtyOverride !== undefined ? qtyOverride : parseFloat(transferIngQty)
    if (!transferIngTarget || !qty || isNaN(qty) || qty <= 0) return
    if (qty > transferIngTarget.quantity) {
      alert(`Cannot transfer ${qty} ${transferIngTarget.unit}. Only ${transferIngTarget.quantity} available in store.`)
      return
    }
    setTransferIngSaving(true)
    try {
      const res = await fetch(`/api/inventory/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientId: transferIngTarget.id, quantity: qty }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        alert(error || 'Failed to transfer ingredient')
        return
      }
      toast.success(`Transferred ${qty} ${transferIngTarget.unit} of ${transferIngTarget.name} to Bar`)
      setTransferIngTarget(null)
      setTransferIngQty('')
      loadIngredients(true)
      loadLogs(true)
    } catch {
      toast.error('Network error during transfer')
    } finally {
      setTransferIngSaving(false)
    }
  }


  async function handleAdjustIngredient() {
    if (!adjustIngTarget) return
    const inputVal = parseFloat(adjustIngQty)
    if (isNaN(inputVal)) {
      toast.error('Please enter a valid quantity')
      return
    }

    let newQty: number
    if (adjustIngMode === 'add') {
      if (inputVal === 0) {
        toast.error('Please enter a quantity greater than 0')
        return
      }
      newQty = Math.max(0, Math.round((adjustIngTarget.quantity + inputVal) * 100) / 100)
    } else {
      if (inputVal < 0) {
        toast.error('Quantity cannot be negative')
        return
      }
      newQty = Math.round(inputVal * 100) / 100
    }

    const patchBody: any = { quantity: newQty }
    if (adjustIngCost !== '' && !isNaN(parseFloat(adjustIngCost))) {
      patchBody.costPerUnit = parseFloat(adjustIngCost)
    }

    setAdjustIngSaving(true)
    try {
      const res = await fetch(`/api/ingredients/${adjustIngTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = data.error || 'Failed to update ingredient stock'
        toast.error(msg)
        return
      }

      const updated = await res.json().catch(() => ({}))
      const savedQty = typeof updated?.quantity === 'number' ? updated.quantity : newQty
      const savedCost = typeof updated?.costPerUnit === 'number' ? updated.costPerUnit : adjustIngTarget.costPerUnit

      toast.success(`Updated store stock for ${adjustIngTarget.name}: ${savedQty} ${adjustIngTarget.unit}`)
      setIngredients(prev =>
        prev.map(i => (i.id === adjustIngTarget.id ? { ...i, quantity: savedQty, costPerUnit: savedCost } : i))
      )
      setAdjustIngTarget(null)
      setAdjustIngQty('')
      setAdjustIngCost('')
      loadIngredients(true)
      loadLogs(true)
    } catch {
      toast.error('Network error updating ingredient stock')
    } finally {
      setAdjustIngSaving(false)
    }
  }

  async function saveIngredient() {
    setIngError('')
    const body = {
      name: ingForm.name.trim(),
      unit: ingForm.unit,
      quantity: parseFloat(ingForm.quantity) || 0,
      barQuantity: parseFloat(ingForm.barQuantity) || 0,
      costPerUnit: parseFloat(ingForm.costPerUnit) || 0,
      minThreshold: parseFloat(ingForm.minThreshold) || 0,
    }
    let res
    if (editIng) {
      res = await fetch(`/api/ingredients/${editIng.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      res = await fetch('/api/ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}))
      const msg = error || 'Failed to save'
      setIngError(msg)
      toast.error(msg)
      return
    }
    const saved = await res.json()
    toast.success(editIng ? 'Ingredient updated!' : 'Ingredient created!')
    setShowIngForm(false)
    setIngredients(prev => {
      if (editIng) {
        return prev.map(i => i.id === saved.id ? saved : i)
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
    loadIngredients(true)
    loadLogs(true)
  }

  async function deleteIngredient(id: string) {
    if (!confirm('Delete this ingredient? It will also be removed from all recipes.')) return
    try {
      const res = await fetch(`/api/ingredients/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Ingredient deleted')
        setIngredients(prev => prev.filter(i => i.id !== id))
        loadIngredients(true)
      } else {
        toast.error('Failed to delete ingredient')
      }
    } catch {
      toast.error('Network error deleting ingredient')
    }
  }

  const filtered = items.filter(i => {
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterCat === 'low') return (i.category?.type === 'DRINK' ? i.barQuantity : i.stockQuantity) <= i.lowStockThreshold
    if (filterCat && filterCat !== 'low' && i.category?.id !== filterCat) return false
    return true
  })

  const filteredIngredients = ingredients.filter(i => {
    const q = ingSearchQuery.trim().toLowerCase()
    if (q && !i.name.toLowerCase().includes(q) && !i.unit.toLowerCase().includes(q)) return false
    if (filterIng === 'low') return i.quantity <= i.minThreshold
    if (filterIng && filterIng !== 'low' && i.unit !== filterIng) return false
    return true
  })

  const lowDrinkCount = items.filter(i => (i.category?.type === 'DRINK' ? i.barQuantity : i.stockQuantity) <= i.lowStockThreshold).length
  const lowIngCount = ingredients.filter(i => i.quantity <= i.minThreshold).length

  // Calculations for total sums
  const totalStoreQty = items.reduce((sum, item) => sum + (item.parentItemId ? 0 : item.stockQuantity), 0)
  const totalBarQty = items.reduce((sum, item) => sum + (item.parentItemId ? 0 : item.barQuantity), 0)

  // Calculations for filtered totals
  const filteredStoreQty = filtered.reduce((sum, item) => sum + (item.parentItemId ? 0 : item.stockQuantity), 0)
  const filteredBarQty = filtered.reduce((sum, item) => sum + (item.parentItemId ? 0 : item.barQuantity), 0)
  const filteredTotalQty = filteredStoreQty + filteredBarQty

  const isDateInRange = (dateStr: string | Date) => {
    if (!dateFrom && !dateTo) return true
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return true
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const localDateStr = `${y}-${m}-${day}`
    if (dateFrom && localDateStr < dateFrom) return false
    if (dateTo && localDateStr > dateTo) return false
    return true
  }

  const isManagerOrAdmin = !session || ['ADMIN', 'MANAGER'].includes(session.role)
  const wasteLogs = logs.filter(l => l.action && typeof l.action === 'string' && l.action.startsWith('WASTE'))
  const filteredWasteLogs = wasteLogs.filter(l => {
    if (!isDateInRange(l.createdAt)) return false
    if (wasteFilterReason === 'ALL') return true
    return l.action.toLowerCase().includes(wasteFilterReason.toLowerCase())
  })
  const filteredControlLogs = logs.filter(l => isDateInRange(l.createdAt))

  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px', width: '100%', maxWidth: '100%' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}><span className="gold-text">Inventory</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            {lowDrinkCount + lowIngCount > 0 && <span style={{ color: 'var(--danger-light)', marginRight: '8px' }}>⚠ {lowDrinkCount + lowIngCount} low stock</span>}
            {items.length} products · {ingredients.length} ingredients
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Calendar Date Filter */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--black-card)',
            border: '1px solid var(--black-border)',
            borderRadius: '10px',
            padding: '4px 10px',
          }}>
            <Calendar size={15} style={{ color: 'var(--gold)' }} />
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
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo('') }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px', fontSize: '12px' }}
                title="Clear date filter"
              >
                ✕
              </button>
            )}
          </div>

          <button
            className="btn btn-ghost btn-sm"
            disabled={isRefreshing}
            onClick={async () => {
              setIsRefreshing(true)
              try {
                await Promise.allSettled([loadItems(), loadIngredients(), loadCategories(), loadLogs()])
                toast.success('Inventory refreshed')
              } finally {
                setIsRefreshing(false)
              }
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {tab === 'ingredients' && <button className="btn btn-gold btn-sm" onClick={openNewIng}><Plus size={14} /> Add Ingredient</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="hide-scrollbar" style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--black-border)', paddingBottom: '0', overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', maxWidth: '100%', minWidth: 0 }}>
        {([
          ['drinks', '📦 Store Stock'],
          ['ingredients', '🥩 Ingredients'],
          ['logs', '📋 Control Logs'],
          ...(isManagerOrAdmin ? [['waste', '🗑 Waste Logs'] as const] : [])
        ] as [string, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            style={{
              padding: '10px 20px', fontSize: '14px', fontWeight: '600',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === key ? '2px solid var(--gold)' : '2px solid transparent',
              color: tab === key ? 'var(--gold)' : 'var(--text-secondary)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {label}
            {key === 'drinks' && lowDrinkCount > 0 && <span style={{ marginLeft: '6px', background: 'var(--danger-light)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '11px' }}>{lowDrinkCount}</span>}
            {key === 'ingredients' && lowIngCount > 0 && <span style={{ marginLeft: '6px', background: 'var(--danger-light)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '11px' }}>{lowIngCount}</span>}
            {key === 'waste' && wasteLogs.length > 0 && <span style={{ marginLeft: '6px', background: 'rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '10px', padding: '1px 6px', fontSize: '11px', fontWeight: '700' }}>{wasteLogs.length}</span>}
          </button>
        ))}
      </div>

      {/* ── STORE STOCK TAB ── */}
      {tab === 'drinks' && (
        <>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '100%', minWidth: 0 }}>
            <div className="hide-scrollbar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', width: '100%', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch', flex: '1 1 300px' }}>
              <button className={`btn btn-sm ${!filterCat ? 'btn-gold' : 'btn-outline'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setFilterCat('')}>All Items</button>
              {categories.map(c => (
                <button key={c.id} className={`btn btn-sm ${filterCat === c.id ? 'btn-gold' : 'btn-outline'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setFilterCat(c.id)}>
                  {c.type === 'FOOD' ? '🍽' : c.type === 'DRINK' ? '🍹' : '📦'} {c.name}
                </button>
              ))}
              <button className={`btn btn-sm ${filterCat === 'low' ? 'btn-gold' : 'btn-outline'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setFilterCat('low')}>⚠ Low Stock</button>
            </div>
            <div style={{ position: 'relative', width: '100%', maxWidth: '320px', minWidth: 0, flex: '1 1 200px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search items..."
                className="input"
                style={{ paddingLeft: '36px', height: '36px', fontSize: '13px', width: '100%' }}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
            <div className="table-scrollbar" onWheel={handleTableWheel} style={{ width: '100%' }}>
              <table className="inventory-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)' }}>
                    <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Item</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Category</th>
                    <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(201,168,76,0.08)', borderLeft: '1px solid rgba(201,168,76,0.15)', borderRight: '1px solid rgba(201,168,76,0.15)' }}>
                      Store <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--gold)', marginLeft: '3px', background: 'rgba(201,168,76,0.15)', padding: '1px 5px', borderRadius: '6px' }}>{filteredStoreQty}</span>
                    </th>
                    <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(82,183,136,0.08)', borderRight: '1px solid rgba(82,183,136,0.15)' }}>
                      Bar <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--success-light)', marginLeft: '3px', background: 'rgba(82,183,136,0.15)', padding: '1px 5px', borderRadius: '6px' }}>{filteredBarQty}</span>
                    </th>
                    <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(59,130,246,0.08)', borderRight: '1px solid rgba(59,130,246,0.15)' }}>
                      Total <span style={{ fontSize: '11px', fontWeight: '800', color: '#60a5fa', marginLeft: '3px', background: 'rgba(59,130,246,0.15)', padding: '1px 5px', borderRadius: '6px' }}>{filteredTotalQty}</span>
                    </th>
                    <th style={{ padding: '10px 6px', textAlign: 'right', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Cost</th>
                    <th style={{ padding: '10px 6px', textAlign: 'right', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Sell</th>
                    <th style={{ padding: '10px 6px', textAlign: 'right', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Margin</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Status</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingItems ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>Loading items...</span>
                        </div>
                      </td>
                    </tr>
                  ) : itemsError ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--danger-light)' }}>
                        <div style={{ marginBottom: '10px', fontSize: '13px' }}>⚠ {itemsError}</div>
                        <button className="btn btn-outline btn-sm" onClick={() => loadItems()}>Try Again</button>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>No items found.</td></tr>
                  ) : (
                    <>
                      {filtered.map(item => {
                        const isDrink = item.category?.type === 'DRINK'
                        const isLow = isDrink ? item.barQuantity <= item.lowStockThreshold : item.stockQuantity <= item.lowStockThreshold
                        const storeQty = item.parentItemId ? 0 : item.stockQuantity
                        const barQty = item.parentItemId ? 0 : item.barQuantity
                        const totalQty = storeQty + barQty
                        return (
                          <tr key={item.id} style={{ borderTop: '1px solid var(--black-border)', background: isLow ? 'rgba(230,57,70,0.03)' : 'transparent' }}>
                            <td style={{ padding: '9px 10px', fontWeight: '500' }}>
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.25 }}>{item.name}</div>
                              {item.parentItemId && (
                                <div style={{ fontSize: '11px', color: 'var(--gold)', marginTop: '1px' }}>
                                  → {items.find(i => i.id === item.parentItemId)?.name} (×{item.unitMultiplier})
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '9px 8px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {item.category?.type === 'FOOD' ? '🍽' : item.category?.type === 'DRINK' ? '🍹' : '📦'} {item.category?.name || '—'}
                            </td>
                            
                            {/* Store Qty Cell - Shaded */}
                            <td style={{ padding: '9px 6px', textAlign: 'center', background: 'rgba(201,168,76,0.03)', borderLeft: '1px solid rgba(201,168,76,0.1)', borderRight: '1px solid rgba(201,168,76,0.1)' }}>
                              {item.parentItemId ? (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>linked</span>
                              ) : (
                                <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{item.stockQuantity}</span>
                              )}
                            </td>
                            
                            {/* Bar Qty Cell - Shaded */}
                            <td style={{ padding: '9px 6px', textAlign: 'center', background: 'rgba(82,183,136,0.03)', borderRight: '1px solid rgba(82,183,136,0.1)' }}>
                              <span style={{ fontWeight: '700', fontSize: '14px', color: (isDrink && isLow) ? 'var(--danger-light)' : 'var(--success-light)' }}>{barQty}</span>
                            </td>
                            
                            {/* Total Qty Cell - Shaded */}
                            <td style={{ padding: '9px 6px', textAlign: 'center', background: 'rgba(59,130,246,0.03)', borderRight: '1px solid rgba(59,130,246,0.1)' }}>
                              <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{totalQty}</span>
                            </td>

                            {/* Cost Price */}
                            <td style={{ padding: '9px 6px', textAlign: 'right', fontSize: '12px', whiteSpace: 'nowrap' }}>
                              {(() => {
                                const { cost, isRecipe } = getEffectiveItemCost(item)
                                if (cost > 0) {
                                  return (
                                    <span style={{ color: 'var(--text-secondary)' }} title={isRecipe ? 'Calculated from recipe ingredients' : 'Direct cost'}>
                                      {cost.toFixed(2)} {isRecipe && <span style={{ fontSize: '10px', color: 'var(--gold)' }}>★</span>}
                                    </span>
                                  )
                                }
                                return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                              })()}
                            </td>

                            {/* Sell Price */}
                            <td style={{ padding: '9px 6px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {item.price.toFixed(2)}
                            </td>

                            {/* Margin */}
                            <td style={{ padding: '9px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {(() => {
                                const { cost } = getEffectiveItemCost(item)
                                if (cost > 0) {
                                  const margin = item.price - cost
                                  const pct = ((margin / item.price) * 100).toFixed(0)
                                  return (
                                    <span style={{ fontSize: '11px', fontWeight: '700', color: margin >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>
                                      {margin >= 0 ? '+' : ''}{margin.toFixed(2)} ({pct}%)
                                    </span>
                                  )
                                }
                                return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                              })()}
                            </td>

                            {/* Status & Min threshold */}
                            <td style={{ padding: '9px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {isLow ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: 'var(--danger-light)', background: 'rgba(230,57,70,0.12)', padding: '2px 6px', borderRadius: '6px', fontWeight: '700' }}>
                                  <AlertTriangle size={11} /> LOW (≤{item.lowStockThreshold})
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: 'var(--success-light)', background: 'rgba(82,183,136,0.1)', padding: '2px 6px', borderRadius: '6px', fontWeight: '600' }}>
                                  OK <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '400' }}>(min {item.lowStockThreshold})</span>
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td style={{ padding: '9px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                                <button
                                  className="btn btn-gold btn-sm"
                                  style={{ padding: '4px 9px', fontSize: '12px', height: 'auto', minHeight: 'unset', lineHeight: '1.2' }}
                                  onClick={() => { setTransferTarget(item); setTransferQty('') }}
                                  title="Transfer to Bar"
                                >
                                  Transfer
                                </button>
                                <button
                                  className="btn btn-outline btn-sm"
                                  style={{ padding: '4px 9px', fontSize: '12px', height: 'auto', minHeight: 'unset', lineHeight: '1.2' }}
                                  onClick={() => { setAdjustTarget(item); setAdjustQty(''); setAdjustCostPrice(item.costPrice > 0 ? String(item.costPrice) : '') }}
                                  title="Update Store Stock"
                                >
                                  Update
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {loadingItems ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Loading items...</span>
                </div>
              </div>
            ) : itemsError ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px', color: 'var(--danger-light)' }}>
                <div style={{ marginBottom: '10px', fontSize: '13px' }}>⚠ {itemsError}</div>
                <button className="btn btn-outline btn-sm" onClick={() => loadItems()}>Try Again</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No items found.</div>
            ) : filtered.map(item => {
              const isDrink = item.category?.type === 'DRINK'
              const isLow = isDrink ? item.barQuantity <= item.lowStockThreshold : item.stockQuantity <= item.lowStockThreshold
              const storeQty = item.parentItemId ? 0 : item.stockQuantity
              const barQty = isDrink ? item.barQuantity : 0
              const totalQty = storeQty + barQty
              return (
                <div
                  key={item.id}
                  className="card"
                  style={{
                    background: 'var(--black-card)',
                    border: isLow ? '1px solid var(--danger-light)' : '1px solid var(--black-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {item.category?.type === 'FOOD' ? '🍽' : item.category?.type === 'DRINK' ? '🍹' : '📦'} {item.category?.name}
                      </div>
                    </div>
                    {isLow ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--danger-light)', background: 'rgba(230,57,70,0.1)', padding: '3px 8px', borderRadius: '8px', fontWeight: '700' }}>
                        <AlertTriangle size={10} /> LOW STOCK
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--success-light)', background: 'rgba(82,183,136,0.1)', padding: '3px 8px', borderRadius: '8px', fontWeight: '600' }}>OK</span>
                    )}
                  </div>

                  {item.parentItemId && (
                    <div style={{ fontSize: '11px', color: 'var(--gold)', background: 'rgba(201,168,76,0.05)', padding: '6px 10px', borderRadius: '6px', border: '1px dashed rgba(201,168,76,0.2)' }}>
                      → linked to {items.find(i => i.id === item.parentItemId)?.name} ×{item.unitMultiplier}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '13px', background: 'var(--black-hover)', padding: '8px', borderRadius: '8px', border: '1px solid var(--black-border)' }}>
                    <div style={{ background: 'rgba(201,168,76,0.04)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(201,168,76,0.1)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Store Qty</span>
                      {item.parentItemId ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>linked</span>
                      ) : (
                        <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{item.stockQuantity}</span>
                      )}
                    </div>
                    <div style={{ background: 'rgba(82,183,136,0.04)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(82,183,136,0.1)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Bar Qty</span>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: (isDrink && isLow) ? 'var(--danger-light)' : 'var(--success-light)' }}>{item.barQuantity}</span>
                    </div>
                    <div style={{ background: 'rgba(59,130,246,0.04)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.1)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Total Qty</span>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{totalQty}</span>
                    </div>
                    
                    <div style={{ gridColumn: 'span 1', marginTop: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>Cost Price</span>
                      {(() => {
                        const { cost, isRecipe } = getEffectiveItemCost(item)
                        if (cost > 0) {
                          return (
                            <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>
                              {cost.toFixed(2)} ETB {isRecipe && <span style={{ fontSize: '10px', color: 'var(--gold)' }}>★</span>}
                            </span>
                          )
                        }
                        return <span style={{ color: 'var(--text-muted)' }}>-</span>
                      })()}
                    </div>
                    <div style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>Sell Price</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.price.toFixed(2)} ETB</span>
                    </div>
                    <div style={{ gridColumn: 'span 3', marginTop: '4px', borderTop: '1px solid var(--black-border)', paddingTop: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Profit Margin</span>
                      {(() => {
                        const { cost } = getEffectiveItemCost(item)
                        if (cost > 0) {
                          const margin = item.price - cost
                          const pct = ((margin / item.price) * 100).toFixed(0)
                          return (
                            <span style={{ fontWeight: '700', color: margin >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>
                              {margin >= 0 ? '+' : ''}{margin.toFixed(2)} ETB ({pct}%)
                            </span>
                          )
                        }
                        return <span style={{ color: 'var(--text-muted)' }}>-</span>
                      })()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button className="btn btn-gold btn-sm" style={{ flex: 1, padding: '10px 0' }} onClick={() => { setTransferTarget(item); setTransferQty('') }}>
                      Transfer
                    </button>
                    <button className="btn btn-outline btn-sm" style={{ flex: 1, padding: '10px 0' }} onClick={() => { setAdjustTarget(item); setAdjustQty(''); setAdjustCostPrice(item.costPrice > 0 ? String(item.costPrice) : '') }}>
                      Update Stock
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

        </>
      )}

      {/* ── INGREDIENTS TAB ── */}
      {tab === 'ingredients' && (
        <>


          {/* Search and Filter Buttons Bar */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '100%', minWidth: 0 }}>
            <div className="hide-scrollbar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', width: '100%', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch', flex: '1 1 300px' }}>
              <button className={`btn btn-sm ${!filterIng ? 'btn-gold' : 'btn-outline'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setFilterIng('')}>All Ingredients</button>
              <button className={`btn btn-sm ${filterIng === 'low' ? 'btn-gold' : 'btn-outline'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setFilterIng('low')}>⚠ Low Stock</button>
            </div>
            <div style={{ position: 'relative', width: '100%', maxWidth: '320px', minWidth: 0, flex: '1 1 200px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search ingredients..."
                className="input"
                style={{ paddingLeft: '36px', height: '36px', fontSize: '13px', width: '100%' }}
                value={ingSearchQuery}
                onChange={e => setIngSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
            <div className="table-scrollbar" onWheel={handleTableWheel} style={{ width: '100%' }}>
              <table className="inventory-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)' }}>
                    <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Ingredient</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Unit</th>
                    <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '11px', color: 'var(--gold)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(201,168,76,0.06)' }}>Store Qty</th>
                    <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '11px', color: 'var(--success-light)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(82,183,136,0.06)' }}>Bar Qty</th>
                    <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '11px', color: '#60a5fa', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(59,130,246,0.06)' }}>Total Qty</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Cost / Unit</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Stock Value</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Status</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingIngs ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>Loading ingredients...</span>
                        </div>
                      </td>
                    </tr>
                  ) : ingsError ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--danger-light)' }}>
                        <div style={{ marginBottom: '10px', fontSize: '13px' }}>⚠ {ingsError}</div>
                        <button className="btn btn-outline btn-sm" onClick={() => loadIngredients()}>Try Again</button>
                      </td>
                    </tr>
                  ) : filteredIngredients.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      {ingredients.length === 0 ? <>No ingredients yet. Click <strong>Add Ingredient</strong> to start.</> : 'No ingredients found.'}
                    </td></tr>
                  ) : filteredIngredients.map(ing => {
                    const storeQty = Number(ing.quantity || 0)
                    const barQty = Number(ing.barQuantity || 0)
                    const totalQty = storeQty + barQty
                    const isLow = totalQty <= ing.minThreshold
                    const costVal = Number(ing.costPerUnit || 0)
                    const totalVal = Math.round(totalQty * costVal * 100) / 100
                    return (
                      <tr key={ing.id} style={{ borderTop: '1px solid var(--black-border)', background: isLow ? 'rgba(230,57,70,0.03)' : 'transparent' }}>
                        <td style={{ padding: '9px 10px', fontWeight: '500' }}>
                          {isLow && <span style={{ color: 'var(--danger-light)', marginRight: '6px' }}>⚠</span>}
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{ing.name}</span>
                        </td>
                        <td style={{ padding: '9px 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>{ing.unit}</td>

                        {/* Store Qty Cell - Shaded */}
                        <td style={{ padding: '9px 6px', textAlign: 'center', background: 'rgba(201,168,76,0.03)', borderLeft: '1px solid rgba(201,168,76,0.1)', borderRight: '1px solid rgba(201,168,76,0.1)' }}>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{storeQty}</span>
                        </td>

                        {/* Bar Qty Cell - Shaded */}
                        <td style={{ padding: '9px 6px', textAlign: 'center', background: 'rgba(82,183,136,0.03)', borderRight: '1px solid rgba(82,183,136,0.1)' }}>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: isLow ? 'var(--danger-light)' : 'var(--success-light)' }}>{barQty}</span>
                        </td>

                        {/* Total Qty Cell - Shaded */}
                        <td style={{ padding: '9px 6px', textAlign: 'center', background: 'rgba(59,130,246,0.03)', borderRight: '1px solid rgba(59,130,246,0.1)' }}>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: isLow ? 'var(--danger-light)' : 'var(--text-primary)' }}>{totalQty}</span>
                        </td>

                        <td style={{ padding: '9px 8px', textAlign: 'right', fontSize: '12px' }}>
                          {costVal > 0 ? (
                            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{costVal.toFixed(2)}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'right', fontSize: '12px' }}>
                          {costVal > 0 ? (
                            <span style={{ fontWeight: '700', color: 'var(--gold-light)' }}>{totalVal.toFixed(2)}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {isLow ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: 'var(--danger-light)', background: 'rgba(230,57,70,0.12)', padding: '2px 6px', borderRadius: '6px', fontWeight: '700' }}>
                              <AlertTriangle size={11} /> LOW (≤{ing.minThreshold})
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: 'var(--success-light)', background: 'rgba(82,183,136,0.1)', padding: '2px 6px', borderRadius: '6px', fontWeight: '600' }}>
                              OK <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '400' }}>(min {ing.minThreshold})</span>
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                            <button
                              className="btn btn-gold btn-sm"
                              style={{ fontSize: '12px', padding: '4px 10px', height: 'auto', minHeight: 'unset', lineHeight: '1.2' }}
                              onClick={() => {
                                setTransferIngTarget(ing)
                                setTransferIngQty('')
                              }}
                              title="Transfer from Store to Bar"
                            >
                              Transfer to Bar
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ padding: '4px 9px', fontSize: '12px', height: 'auto', minHeight: 'unset', lineHeight: '1.2' }}
                              onClick={() => {
                                setAdjustIngTarget(ing)
                                setAdjustIngQty('')
                                setAdjustIngCost(ing.costPerUnit ? String(ing.costPerUnit) : '')
                                setAdjustIngMode('add')
                              }}
                              title="Update Store Stock"
                            >
                              Update Store
                            </button>
                            <button className="btn btn-outline btn-sm" style={{ padding: '4px 7px', height: 'auto', minHeight: 'unset' }} onClick={() => openEditIng(ing)} title="Edit ingredient">
                              <Pencil size={12} />
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px', height: 'auto', minHeight: 'unset', color: 'var(--danger-light)' }} onClick={() => deleteIngredient(ing.id)} title="Delete ingredient">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {loadingIngs ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Loading ingredients...</span>
                </div>
              </div>
            ) : ingsError ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px', color: 'var(--danger-light)' }}>
                <div style={{ marginBottom: '10px', fontSize: '13px' }}>⚠ {ingsError}</div>
                <button className="btn btn-outline btn-sm" onClick={() => loadIngredients()}>Try Again</button>
              </div>
            ) : filteredIngredients.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                {ingredients.length === 0 ? <>No ingredients yet. Click <strong>Add Ingredient</strong> to start.</> : 'No ingredients found.'}
              </div>
            ) : filteredIngredients.map(ing => {
              const storeQty = Number(ing.quantity || 0)
              const barQty = Number(ing.barQuantity || 0)
              const totalQty = storeQty + barQty
              const isLow = totalQty <= ing.minThreshold
              const costVal = Number(ing.costPerUnit || 0)
              const totalVal = Math.round(totalQty * costVal * 100) / 100
              return (
                <div
                  key={ing.id}
                  className="card"
                  style={{
                    background: 'var(--black-card)',
                    border: isLow ? '1px solid var(--danger-light)' : '1px solid var(--black-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{ing.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Unit: {ing.unit}</div>
                    </div>
                    {isLow ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--danger-light)', background: 'rgba(230,57,70,0.1)', padding: '3px 8px', borderRadius: '8px', fontWeight: '700' }}>
                        <AlertTriangle size={10} /> LOW
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--success-light)', background: 'rgba(82,183,136,0.1)', padding: '3px 8px', borderRadius: '8px', fontWeight: '600' }}>OK</span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '13px', background: 'var(--black-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--black-border)' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Store Qty</span>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--gold)' }}>
                        {storeQty} {ing.unit}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Bar Qty</span>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--success-light)' }}>
                        {barQty} {ing.unit}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Total</span>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: isLow ? 'var(--danger-light)' : 'var(--text-primary)' }}>
                        {totalQty} {ing.unit}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Min Alert</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{ing.minThreshold} {ing.unit}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Cost / Unit</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        {costVal > 0 ? `${costVal.toFixed(2)}` : '-'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Value</span>
                      <span style={{ fontWeight: '700', color: 'var(--gold-light)' }}>
                        {costVal > 0 ? `${totalVal.toFixed(2)}` : '-'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      className="btn btn-gold btn-sm"
                      style={{ flex: 1.5, padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                      onClick={() => {
                        setTransferIngTarget(ing)
                        setTransferIngQty('')
                      }}
                    >
                      Transfer to Bar
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1.5, padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                      onClick={() => {
                        setAdjustIngTarget(ing)
                        setAdjustIngQty('')
                        setAdjustIngCost(ing.costPerUnit ? String(ing.costPerUnit) : '')
                        setAdjustIngMode('add')
                      }}
                    >
                      Update Store
                    </button>
                    <button className="btn btn-outline btn-sm" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }} onClick={() => openEditIng(ing)}>
                      <Pencil size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '10px 12px', color: 'var(--danger-light)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => deleteIngredient(ing.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── CONTROL LOGS TAB ── */}
      {tab === 'logs' && (
        <>
          {/* Desktop Table View */}
          <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
            <div className="table-scrollbar" onWheel={handleTableWheel} style={{ width: '100%' }}>
              <table className="inventory-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)' }}>
                    <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Date & Time</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Item Name</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Source/Type</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Action</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Qty Changed</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Prev Qty</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>New Qty</th>
                    <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>User</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>Loading...</td></tr>
                  ) : filteredControlLogs.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>No logs found.</td></tr>
                  ) : filteredControlLogs.map(log => (
                    <tr key={log.id} style={{ borderTop: '1px solid var(--black-border)' }}>
                      <td style={{ padding: '9px 10px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '9px 8px', fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>{log.itemName}</td>
                      <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                        <span className="badge badge-outline" style={{ fontSize: '11px' }}>{log.type}</span>
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                        <span className={`badge ${
                          log.action.startsWith('WASTE') ? 'badge-cancelled' :
                          log.action === 'ADD' || log.action === 'INITIAL' ? 'badge-free' : 
                          log.action === 'TRANSFER' ? 'badge-occupied' : 'badge-open'
                        }`} style={{ fontSize: '11px' }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: '700', color: log.action.startsWith('WASTE') ? 'var(--danger-light)' : (log.action === 'ADD' || log.action === 'INITIAL') ? 'var(--success)' : 'var(--text-primary)' }}>
                        {log.action.startsWith('WASTE') ? `-${log.quantity}` : (log.action === 'ADD' || log.action === 'INITIAL') ? `+${log.quantity}` : log.quantity}
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>{log.prevQty}</td>
                      <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{log.newQty}</td>
                      <td style={{ padding: '9px 10px', fontWeight: '600', color: 'var(--text-primary)', fontSize: '12px' }}>{log.userName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {loadingLogs ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
            ) : filteredControlLogs.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No logs found.</div>
            ) : filteredControlLogs.map(log => (
              <div key={log.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{log.itemName}</span>
                  <span className={`badge ${
                    log.action.startsWith('WASTE') ? 'badge-cancelled' :
                    log.action === 'ADD' || log.action === 'INITIAL' ? 'badge-free' : 
                    log.action === 'TRANSFER' ? 'badge-occupied' : 'badge-open'
                  }`} style={{ fontSize: '11px' }}>{log.action}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>Type: <b>{log.type}</b></span>
                  <span>User: <b>{log.userName}</b></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--black-border)', paddingTop: '10px', marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(log.createdAt).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    Qty: <b style={{ color: log.action.startsWith('WASTE') ? 'var(--danger-light)' : (log.action === 'ADD' || log.action === 'INITIAL') ? 'var(--success)' : 'inherit' }}>{log.action.startsWith('WASTE') ? `-${log.quantity}` : (log.action === 'ADD' || log.action === 'INITIAL') ? `+${log.quantity}` : log.quantity}</b> 
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px', marginLeft: '6px' }}>({log.prevQty} → {log.newQty})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── WASTE LOGS TAB (Admin & Manager Only) ── */}
      {tab === 'waste' && isManagerOrAdmin && (
        <>
          {/* Waste Toolbar: Quick Filters + Single Log Waste Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', flex: 1 }}>
              {[
                ['ALL', 'All Waste'],
                ['Expired', '🕒 Expired / Shelf Life'],
                ['Spoiled', '⚠️ Quality / Spoiled'],
                ['Damaged', '💥 Damaged / Broken'],
                ['Preparation', '👨‍🍳 Prep Error'],
              ].map(([fKey, fLabel]) => (
                <button
                  key={fKey}
                  className={`btn btn-sm ${wasteFilterReason === fKey ? 'btn-gold' : 'btn-outline'}`}
                  style={{ whiteSpace: 'nowrap', fontSize: '12px' }}
                  onClick={() => setWasteFilterReason(fKey)}
                >
                  {fLabel}
                </button>
              ))}
            </div>

            <button
              className="btn btn-sm"
              style={{
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
              onClick={() => {
                setWasteSelectedId('')
                setWasteQty('')
                setWasteNotes('')
                setShowWasteModal(true)
              }}
            >
              <Plus size={15} /> Log Waste
            </button>
          </div>

          {/* Desktop Table */}
          <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
            <div className="table-scrollbar" onWheel={handleTableWheel} style={{ width: '100%' }}>
              <table className="inventory-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)' }}>
                    <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Date & Time</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Item Name</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Source/Type</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Wasted Qty</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Prev Qty</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>New Qty</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Reason / Notes</th>
                    <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Logged By</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>Loading waste logs...</td></tr>
                  ) : filteredWasteLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                        <Trash2 size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                        <div style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>No waste records found</div>
                        <div style={{ fontSize: '12px', marginTop: '4px' }}>All items and ingredients are currently accounted for without recorded spoilage.</div>
                      </td>
                    </tr>
                  ) : filteredWasteLogs.map(log => (
                    <tr key={log.id} style={{ borderTop: '1px solid var(--black-border)' }}>
                      <td style={{ padding: '9px 10px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '9px 8px', fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>
                        {log.itemName}
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                        <span className="badge badge-outline" style={{ fontSize: '11px' }}>
                          {log.type === 'INGREDIENT' ? '🥩 INGREDIENT' : log.type === 'BAR' ? '🍸 BAR' : '📦 STORE'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--danger-light)' }}>
                        -{log.quantity}
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {log.prevQty}
                      </td>
                      <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>
                        {log.newQty}
                      </td>
                      <td style={{ padding: '9px 8px' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(239,68,68,0.12)',
                          color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.25)'
                        }}>
                          {log.action.replace('WASTE: ', '')}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px', fontWeight: '600', color: 'var(--text-primary)', fontSize: '12px' }}>
                        {log.userName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            {loadingLogs ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>Loading...</div>
            ) : filteredWasteLogs.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>No waste records found.</div>
            ) : filteredWasteLogs.map(log => (
              <div key={log.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{log.itemName}</span>
                  <span style={{ color: 'var(--danger-light)', fontWeight: '800', fontSize: '14px' }}>-{log.quantity}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>Source: <b>{log.type}</b></span>
                  <span>Stock: {log.prevQty} → <b>{log.newQty}</b></span>
                </div>
                <div style={{ fontSize: '11px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  Reason: {log.action.replace('WASTE: ', '')}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', paddingTop: '4px' }}>
                  <span>By: {log.userName}</span>
                  <span>{new Date(log.createdAt).toLocaleString('en-ET', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Drink Stock Adjust Modal */}
      {adjustTarget && (
        <Portal><div className="modal-overlay" onClick={() => setAdjustTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Update Store Stock</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>{adjustTarget.name} — Store: <b style={{ color: 'var(--gold)' }}>{adjustTarget.stockQuantity}</b></p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => adjustStock(-1)}><Minus size={16} /></button>
              <input className="input" type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} style={{ width: '100px', textAlign: 'center', fontSize: '20px', fontWeight: '700' }} />
              <button className="btn btn-outline" onClick={() => adjustStock(1)}><Plus size={16} /></button>
            </div>
            <label className="input-label">Bought Price Per Unit (ETB)</label>
            <input
              className="input"
              type="number"
              placeholder={adjustTarget.costPrice > 0 ? `Last: ${adjustTarget.costPrice.toFixed(2)} ETB` : 'e.g. 85.00'}
              value={adjustCostPrice}
              onChange={e => setAdjustCostPrice(e.target.value)}
              style={{ marginBottom: '16px' }}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {adjustCostPrice && parseFloat(adjustCostPrice) > 0
                ? `Margin: ${(adjustTarget.price - parseFloat(adjustCostPrice)).toFixed(2)} ETB per unit`
                : adjustTarget.costPrice > 0 ? `Keeping last bought price: ${adjustTarget.costPrice.toFixed(2)} ETB` : 'Enter cost to track profit margin'}
            </div>
            {adjustTarget.parentItemId && (() => {
              const parentItem = items.find(i => i.id === adjustTarget.parentItemId)
              const qty = parseInt(adjustQty) || 0
              return (
                <div style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid var(--gold)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--gold)', fontWeight: '600' }}>Linked Item: </span>
                  <span style={{ color: 'var(--text-secondary)' }}>Adding {qty} {adjustTarget.name}{qty !== 1 ? 's' : ''} will add <b style={{ color: 'var(--text-primary)' }}>{qty * adjustTarget.unitMultiplier} {parentItem?.name || 'units'}</b> to the store stock.</span>
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={setStockDirect}>Add {adjustQty || 0} to Stock</button>
              <button className="btn btn-ghost" onClick={() => setAdjustTarget(null)}>Cancel</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Transfer to Bar Modal */}
      {transferTarget && (
        <Portal><div className="modal-overlay" onClick={() => setTransferTarget(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Transfer to Bar</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{transferTarget.name}</strong> <br/>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Store Qty: <b style={{ color: 'var(--gold)' }}>{transferTarget.stockQuantity}</b> | Bar Qty: <b style={{ color: 'var(--success-light)' }}>{transferTarget.barQuantity}</b>
              </span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="input-label" style={{ marginBottom: 0 }}>Quantity to move from Store to Bar</label>
              {transferTarget.stockQuantity > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '6px' }}
                  onClick={() => setTransferQty(String(transferTarget.stockQuantity))}
                >
                  ⚡ All ({transferTarget.stockQuantity})
                </button>
              )}
            </div>
            <input
              className="input"
              type="number"
              placeholder={transferTarget.stockQuantity > 0 ? `e.g. ${transferTarget.stockQuantity}` : '0 available in store'}
              value={transferQty}
              onChange={e => setTransferQty(e.target.value)}
              autoFocus
              style={{ marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => handleTransfer(transferTarget.stockQuantity)}
                  disabled={transferTarget.stockQuantity <= 0}
                  title={`Transfer all ${transferTarget.stockQuantity} units to bar`}
                >
                  ⚡ Transfer All ({transferTarget.stockQuantity})
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => handleTransfer()}
                  disabled={!transferQty || parseInt(transferQty) <= 0 || parseInt(transferQty) > transferTarget.stockQuantity}
                >
                  Transfer {transferQty && parseInt(transferQty) > 0 ? `(${transferQty})` : ''}
                </button>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setTransferTarget(null)}>Cancel</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Transfer Ingredient to Bar Modal */}
      {transferIngTarget && (
        <Portal><div className="modal-overlay" onClick={() => setTransferIngTarget(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Transfer to Bar</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{transferIngTarget.name}</strong> <br/>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Store Qty: <b style={{ color: 'var(--gold)' }}>{transferIngTarget.quantity} {transferIngTarget.unit}</b> | Bar Qty: <b style={{ color: 'var(--success-light)' }}>{transferIngTarget.barQuantity || 0} {transferIngTarget.unit}</b>
              </span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="input-label" style={{ marginBottom: 0 }}>Quantity to move from Store to Bar ({transferIngTarget.unit})</label>
              {transferIngTarget.quantity > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '6px' }}
                  onClick={() => setTransferIngQty(String(transferIngTarget.quantity))}
                >
                  ⚡ All ({transferIngTarget.quantity})
                </button>
              )}
            </div>
            <input
              className="input"
              type="number"
              step="any"
              placeholder={transferIngTarget.quantity > 0 ? `e.g. ${transferIngTarget.quantity}` : '0 available in store'}
              value={transferIngQty}
              onChange={e => setTransferIngQty(e.target.value)}
              autoFocus
              style={{ marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => handleTransferIng(transferIngTarget.quantity)}
                  disabled={transferIngTarget.quantity <= 0 || transferIngSaving}
                  title={`Transfer all ${transferIngTarget.quantity} ${transferIngTarget.unit} to bar`}
                >
                  ⚡ Transfer All ({transferIngTarget.quantity})
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => handleTransferIng()}
                  disabled={!transferIngQty || parseFloat(transferIngQty) <= 0 || parseFloat(transferIngQty) > transferIngTarget.quantity || transferIngSaving}
                >
                  {transferIngSaving ? 'Transferring...' : `Transfer ${transferIngQty && parseFloat(transferIngQty) > 0 ? `(${transferIngQty})` : ''}`}
                </button>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setTransferIngTarget(null)}>Cancel</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Ingredient Add/Edit Modal */}
      {showIngForm && (
        <Portal><div className="modal-overlay" onClick={() => setShowIngForm(false)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editIng ? 'Edit Ingredient' : 'New Ingredient'}</h3>
            {ingError && (
              <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid var(--danger-light)', borderRadius: '8px', padding: '10px 14px', color: 'var(--danger-light)', fontSize: '13px', marginBottom: '16px' }}>⚠ {ingError}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Name</label>
                <input className="input" placeholder="e.g. Beef, Tomato, Onion" value={ingForm.name} onChange={e => setIngForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="input-label">Unit</label>
                <select className="input" value={ingForm.unit} onChange={e => setIngForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Low Stock Alert At</label>
                <input className="input" type="number" step="any" value={ingForm.minThreshold} onChange={e => setIngForm(f => ({ ...f, minThreshold: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Store Stock</label>
                <input className="input" type="number" step="any" value={ingForm.quantity} onChange={e => setIngForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Bar Stock</label>
                <input className="input" type="number" step="any" value={ingForm.barQuantity} onChange={e => setIngForm(f => ({ ...f, barQuantity: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Cost / Bought Price (ETB)</label>
                <input className="input" type="number" step="any" placeholder="e.g. 2.00 or 1500" value={ingForm.costPerUnit} onChange={e => setIngForm(f => ({ ...f, costPerUnit: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={saveIngredient}>{editIng ? 'Save Changes' : 'Add Ingredient'}</button>
              <button className="btn btn-ghost" onClick={() => setShowIngForm(false)}>Cancel</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Ingredient Stock Adjust Modal */}
      {adjustIngTarget && (
        <Portal><div className="modal-overlay" onClick={() => setAdjustIngTarget(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Update Store Stock</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
              {adjustIngTarget.name} — Store: <b style={{ color: 'var(--gold)' }}>{adjustIngTarget.quantity} {adjustIngTarget.unit}</b> | Bar: <b style={{ color: 'var(--success-light)' }}>{adjustIngTarget.barQuantity || 0} {adjustIngTarget.unit}</b>
            </p>

            {/* Mode Selector */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: 'var(--black-hover)', padding: '4px', borderRadius: '8px', border: '1px solid var(--black-border)' }}>
              <button
                type="button"
                className={`btn btn-sm ${adjustIngMode === 'add' ? 'btn-gold' : 'btn-ghost'}`}
                style={{ flex: 1, fontSize: '12px', padding: '8px 0' }}
                onClick={() => setAdjustIngMode('add')}
              >
                + Add to Stock
              </button>
              <button
                type="button"
                className={`btn btn-sm ${adjustIngMode === 'set' ? 'btn-gold' : 'btn-ghost'}`}
                style={{ flex: 1, fontSize: '12px', padding: '8px 0' }}
                onClick={() => {
                  setAdjustIngMode('set')
                  if (!adjustIngQty) setAdjustIngQty(String(adjustIngTarget.quantity))
                }}
              >
                = Set Exact Stock
              </button>
            </div>

            {adjustIngMode === 'add' ? (
              <>
                <label className="input-label">Quantity to Add ({adjustIngTarget.unit})</label>
                <div style={{ marginBottom: '16px' }}>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    placeholder="0"
                    value={adjustIngQty}
                    onChange={e => setAdjustIngQty(e.target.value)}
                    style={{ textAlign: 'center', fontSize: '18px', fontWeight: '700', width: '100%' }}
                    autoFocus
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label">Cost / Bought Price per Unit (ETB) — Optional</label>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    placeholder={adjustIngTarget.costPerUnit ? `Current: ${adjustIngTarget.costPerUnit.toFixed(2)} ETB` : 'e.g. 2.00 or 1500'}
                    value={adjustIngCost}
                    onChange={e => setAdjustIngCost(e.target.value)}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Leave blank to keep existing bought price, or enter new cost price if this batch changed.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn btn-gold"
                    style={{ flex: 1 }}
                    onClick={handleAdjustIngredient}
                    disabled={adjustIngSaving || !adjustIngQty || parseFloat(adjustIngQty) === 0}
                  >
                    {adjustIngSaving ? 'Saving...' : `Add ${adjustIngQty || 0} ${adjustIngTarget.unit} to Store`}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setAdjustIngTarget(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <label className="input-label">New Exact Stock ({adjustIngTarget.unit})</label>
                <input
                  className="input"
                  type="number"
                  step="any"
                  placeholder="e.g. 25"
                  value={adjustIngQty}
                  onChange={e => setAdjustIngQty(e.target.value)}
                  style={{ textAlign: 'center', fontSize: '18px', fontWeight: '700', marginBottom: '16px', width: '100%' }}
                  autoFocus
                />

                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label">Cost / Bought Price per Unit (ETB) — Optional</label>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    placeholder={adjustIngTarget.costPerUnit ? `Current: ${adjustIngTarget.costPerUnit.toFixed(2)} ETB` : 'e.g. 2.00 or 1500'}
                    value={adjustIngCost}
                    onChange={e => setAdjustIngCost(e.target.value)}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Leave blank to keep existing bought price, or enter new cost price if changed.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn btn-gold"
                    style={{ flex: 1 }}
                    onClick={handleAdjustIngredient}
                    disabled={adjustIngSaving || !adjustIngQty || parseFloat(adjustIngQty) < 0}
                  >
                    {adjustIngSaving ? 'Saving...' : `Set Stock to ${adjustIngQty || 0} ${adjustIngTarget.unit}`}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setAdjustIngTarget(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div></Portal>
      )}

      {/* ── LOG WASTE MODAL (Admin & Manager) ── */}
      {showWasteModal && isManagerOrAdmin && (
        <Portal>
          <div className="modal-overlay" onClick={() => setShowWasteModal(false)}>
            <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Trash2 size={18} color="#ef4444" />
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  Log Waste / Spoilage
                </h3>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '18px' }}>
                Deduct expired or spoiled items and record a verified write-off log.
              </p>

              <form onSubmit={handleLogWaste}>
                {/* Item Type Switch */}
                <div style={{ marginBottom: '14px' }}>
                  <label className="input-label">Inventory Category</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${wasteItemType === 'ITEM' ? 'btn-gold' : 'btn-outline'}`}
                      style={{ flex: 1 }}
                      onClick={() => { setWasteItemType('ITEM'); setWasteSelectedId(''); }}
                    >
                      🍰 Store / Menu Items
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${wasteItemType === 'INGREDIENT' ? 'btn-gold' : 'btn-outline'}`}
                      style={{ flex: 1 }}
                      onClick={() => { setWasteItemType('INGREDIENT'); setWasteSelectedId(''); }}
                    >
                      🥩 Raw Ingredients
                    </button>
                  </div>
                </div>

                {/* Item Select */}
                <div style={{ marginBottom: '14px' }}>
                  <label className="input-label">Select {wasteItemType === 'ITEM' ? 'Product' : 'Ingredient'}</label>
                  <select
                    className="input"
                    value={wasteSelectedId}
                    onChange={e => setWasteSelectedId(e.target.value)}
                    required
                    style={{ width: '100%', background: 'var(--black)', color: 'var(--text-primary)' }}
                  >
                    <option value="">-- Choose {wasteItemType === 'ITEM' ? 'Item' : 'Ingredient'} --</option>
                    {wasteItemType === 'ITEM' ? (
                      items.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name} (Store: {i.stockQuantity}, Bar: {i.barQuantity})
                        </option>
                      ))
                    ) : (
                      ingredients.map(ing => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.quantity} {ing.unit})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Location (Store vs Bar for Menu items) */}
                {wasteItemType === 'ITEM' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label className="input-label">Stock Location</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${wasteLocation === 'STORE' ? 'btn-gold' : 'btn-outline'}`}
                        style={{ flex: 1 }}
                        onClick={() => setWasteLocation('STORE')}
                      >
                        📦 Store Stock
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${wasteLocation === 'BAR' ? 'btn-gold' : 'btn-outline'}`}
                        style={{ flex: 1 }}
                        onClick={() => setWasteLocation('BAR')}
                      >
                        🍸 Bar Stock
                      </button>
                    </div>
                  </div>
                )}

                {/* Quantity */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="input-label" style={{ marginBottom: 0 }}>Quantity to Discard</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1, 2, 5].map(q => (
                        <button
                          key={q}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '1px 8px', fontSize: '11px', border: '1px solid var(--black-border)', borderRadius: '4px', color: 'var(--gold)' }}
                          onClick={() => setWasteQty(String(q))}
                        >
                          +{q}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="e.g. 1"
                    value={wasteQty}
                    onChange={e => setWasteQty(e.target.value)}
                    required
                    style={{ width: '100%', fontSize: '16px', fontWeight: '700' }}
                  />
                </div>

                {/* Reason Dropdown */}
                <div style={{ marginBottom: '14px' }}>
                  <label className="input-label">Reason for Disposal</label>
                  <select
                    className="input"
                    value={wasteReason}
                    onChange={e => setWasteReason(e.target.value)}
                    style={{ width: '100%', background: 'var(--black)', color: 'var(--text-primary)' }}
                  >
                    <option value="Expired / Past Shelf Life">🕒 Expired / Past Shelf Life (Cakes, Dairy)</option>
                    <option value="Quality / Sour / Spoiled">⚠️ Quality / Sour / Spoiled</option>
                    <option value="Damaged / Dropped / Broken">💥 Damaged / Dropped / Broken</option>
                    <option value="Preparation / Cooking Error">👨‍🍳 Preparation / Cooking Error</option>
                    <option value="Contaminated">🚫 Contaminated / Unsafe</option>
                  </select>
                </div>

                {/* Notes */}
                <div style={{ marginBottom: '20px' }}>
                  <label className="input-label">Notes (Optional)</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. Left out overnight, cake was dry, etc."
                    value={wasteNotes}
                    onChange={e => setWasteNotes(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Modal Buttons */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="submit"
                    className="btn btn-sm"
                    style={{
                      flex: 1,
                      background: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: '700',
                      padding: '10px'
                    }}
                    disabled={wasteSubmitting || !wasteSelectedId || !wasteQty}
                  >
                    {wasteSubmitting ? 'Recording...' : 'Confirm Waste'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowWasteModal(false)}
                    disabled={wasteSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

    </div>
  )
}
