'use client'

import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, Plus, Minus, Pencil, Trash2, RefreshCw, Search } from 'lucide-react'
import Portal from '@/components/Portal'

interface Category { id: string; name: string; type: string }
interface MenuItem { id: string; name: string; price: number; stockQuantity: number; barQuantity: number; costPrice: number; lowStockThreshold: number; available: boolean; category?: Category | null; parentItemId?: string | null; unitMultiplier: number; parentItem?: { id: string; name: string } | null }
interface Ingredient { id: string; name: string; unit: string; quantity: number; minThreshold: number }

const UNITS = ['grams', 'kg', 'ml', 'liters', 'pieces', 'cups', 'tbsp', 'tsp']

export default function InventoryPage() {
  const [tab, setTab] = useState<'drinks' | 'ingredients' | 'logs'>('drinks')
  const [searchQuery, setSearchQuery] = useState('')

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
  const [editIng, setEditIng] = useState<Ingredient | null>(null)
  const [ingForm, setIngForm] = useState({ name: '', unit: 'grams', quantity: '0', minThreshold: '0' })
  const [showIngForm, setShowIngForm] = useState(false)
  const [ingError, setIngError] = useState('')
  
  // Stock logging state
  const [logs, setLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  const loadItems = useCallback(async () => {
    setLoadingItems(true)
    try {
      const res = await fetch('/api/menu-items')
      if (res.ok) {
        setItems(await res.json())
      } else {
        console.error('Failed to load menu items:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading menu items:', err)
    } finally {
      setLoadingItems(false)
    }
  }, [])

  const loadIngredients = useCallback(async () => {
    setLoadingIngs(true)
    try {
      const res = await fetch('/api/ingredients')
      if (res.ok) {
        setIngredients(await res.json())
      } else {
        console.error('Failed to load ingredients:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading ingredients:', err)
    } finally {
      setLoadingIngs(false)
    }
  }, [])

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories')
      if (res.ok) {
        setCategories(await res.json())
      } else {
        console.error('Failed to load categories:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const res = await fetch('/api/inventory/logs')
      if (res.ok) {
        setLogs(await res.json())
      } else {
        console.error('Failed to load inventory logs:', res.statusText)
      }
    } catch (err) {
      console.error('Error loading inventory logs:', err)
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => { loadItems(); loadIngredients(); loadCategories(); loadLogs(); }, [loadItems, loadIngredients, loadCategories, loadLogs])

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
    setAdjustTarget(null); setAdjustQty(''); setAdjustCostPrice(''); loadItems(); loadLogs()
  }

  async function handleTransfer() {
    if (!transferTarget || !transferQty) return
    const res = await fetch(`/api/inventory/transfer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuItemId: transferTarget.id, quantity: parseInt(transferQty) }),
    })
    if (!res.ok) {
      const { error } = await res.json()
      alert(error || 'Failed to transfer')
      return
    }
    setTransferTarget(null); setTransferQty(''); loadItems(); loadLogs()
  }

  // Ingredient functions
  function openNewIng() {
    setEditIng(null)
    setIngForm({ name: '', unit: 'grams', quantity: '0', minThreshold: '0' })
    setIngError('')
    setShowIngForm(true)
  }

  function openEditIng(ing: Ingredient) {
    setEditIng(ing)
    setIngForm({ name: ing.name, unit: ing.unit, quantity: String(ing.quantity), minThreshold: String(ing.minThreshold) })
    setIngError('')
    setShowIngForm(true)
  }

  async function saveIngredient() {
    setIngError('')
    const body = { name: ingForm.name.trim(), unit: ingForm.unit, quantity: parseFloat(ingForm.quantity), minThreshold: parseFloat(ingForm.minThreshold) }
    let res
    if (editIng) {
      res = await fetch(`/api/ingredients/${editIng.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      res = await fetch('/api/ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    if (!res.ok) {
      const { error } = await res.json()
      setIngError(error || 'Failed to save')
      return
    }
    setShowIngForm(false)
    loadIngredients()
    loadLogs()
  }

  async function deleteIngredient(id: string) {
    if (!confirm('Delete this ingredient? It will also be removed from all recipes.')) return
    await fetch(`/api/ingredients/${id}`, { method: 'DELETE' })
    loadIngredients()
  }

  const filtered = items.filter(i => {
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterCat === 'low') return (i.category?.type === 'DRINK' ? i.barQuantity : i.stockQuantity) <= i.lowStockThreshold
    if (filterCat && filterCat !== 'low' && i.category?.id !== filterCat) return false
    return true
  })

  const filteredIngredients = ingredients.filter(i => {
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const lowDrinkCount = items.filter(i => i.barQuantity <= i.lowStockThreshold && i.category?.type === 'DRINK').length
  const lowIngCount = ingredients.filter(i => i.quantity <= i.minThreshold).length

  // Calculations for total sums
  const totalStoreQty = items.reduce((sum, item) => sum + (item.parentItemId ? 0 : item.stockQuantity), 0)
  const totalBarQty = items.reduce((sum, item) => sum + (item.category?.type === 'DRINK' ? item.barQuantity : 0), 0)

  // Calculations for filtered totals
  const filteredStoreQty = filtered.reduce((sum, item) => sum + (item.parentItemId ? 0 : item.stockQuantity), 0)
  const filteredBarQty = filtered.reduce((sum, item) => sum + (item.category?.type === 'DRINK' ? item.barQuantity : 0), 0)
  const filteredTotalQty = filteredStoreQty + filteredBarQty

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}><span className="gold-text">Inventory</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            {lowDrinkCount + lowIngCount > 0 && <span style={{ color: 'var(--danger-light)', marginRight: '8px' }}>⚠ {lowDrinkCount + lowIngCount} low stock</span>}
            {items.length} products · {ingredients.length} ingredients
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { loadItems(); loadIngredients() }}><RefreshCw size={14} /> Refresh</button>
          {tab === 'ingredients' && <button className="btn btn-gold btn-sm" onClick={openNewIng}><Plus size={14} /> Add Ingredient</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="hide-scrollbar" style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--black-border)', paddingBottom: '0', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {([['drinks', '📦 Store Stock'], ['ingredients', '🥩 Ingredients'], ['logs', '📋 Control Logs']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px', fontSize: '14px', fontWeight: '600',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === key ? '2px solid var(--gold)' : '2px solid transparent',
              color: tab === key ? 'var(--gold)' : 'var(--text-secondary)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
            {key === 'drinks' && lowDrinkCount > 0 && <span style={{ marginLeft: '6px', background: 'var(--danger-light)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '11px' }}>{lowDrinkCount}</span>}
            {key === 'ingredients' && lowIngCount > 0 && <span style={{ marginLeft: '6px', background: 'var(--danger-light)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '11px' }}>{lowIngCount}</span>}
          </button>
        ))}
      </div>

      {/* ── STORE STOCK TAB ── */}
      {tab === 'drinks' && (
        <>
          {lowDrinkCount > 0 && (
            <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid var(--danger-light)', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertTriangle size={20} color="var(--danger-light)" />
              <div>
                <div style={{ fontWeight: '600', color: 'var(--danger-light)' }}>{lowDrinkCount} item{lowDrinkCount > 1 ? 's' : ''} running low!</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>Click the item to restock.</div>
              </div>
              <button className="btn btn-sm btn-outline" style={{ marginLeft: 'auto', borderColor: 'var(--danger-light)', color: 'var(--danger-light)' }} onClick={() => setFilterCat('low')}>View Low Stock</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              <button className={`btn btn-sm ${!filterCat ? 'btn-gold' : 'btn-outline'}`} onClick={() => setFilterCat('')}>All Items</button>
              {categories.map(c => (
                <button key={c.id} className={`btn btn-sm ${filterCat === c.id ? 'btn-gold' : 'btn-outline'}`} onClick={() => setFilterCat(c.id)}>
                  {c.type === 'FOOD' ? '🍽' : '🍹'} {c.name}
                </button>
              ))}
              <button className={`btn btn-sm ${filterCat === 'low' ? 'btn-gold' : 'btn-outline'}`} onClick={() => setFilterCat('low')}>⚠ Low Stock</button>
            </div>
            <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '300px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search items..."
                className="input"
                style={{ paddingLeft: '36px', height: '36px', fontSize: '13px' }}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)' }}>
                    {['Item', 'Category'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(201,168,76,0.08)', borderLeft: '1px solid rgba(201,168,76,0.15)', borderRight: '1px solid rgba(201,168,76,0.15)' }}>
                      Store Qty <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--gold)', marginLeft: '6px', background: 'rgba(201,168,76,0.1)', padding: '2px 8px', borderRadius: '8px' }}>{filteredStoreQty}</span>
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(82,183,136,0.08)', borderRight: '1px solid rgba(82,183,136,0.15)' }}>
                      Bar Qty <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--success-light)', marginLeft: '6px', background: 'rgba(82,183,136,0.1)', padding: '2px 8px', borderRadius: '8px' }}>{filteredBarQty}</span>
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', background: 'rgba(59,130,246,0.08)', borderRight: '1px solid rgba(59,130,246,0.15)' }}>
                      Total Qty <span style={{ fontSize: '13px', fontWeight: '800', color: '#60a5fa', marginLeft: '6px', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: '8px' }}>{filteredTotalQty}</span>
                    </th>
                    {['Cost Price', 'Sell Price', 'Margin', 'Low Alert At', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingItems ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No items found.</td></tr>
                  ) : (
                    <>
                      {filtered.map(item => {
                        const isDrink = item.category?.type === 'DRINK'
                        const isLow = isDrink ? item.barQuantity <= item.lowStockThreshold : item.stockQuantity <= item.lowStockThreshold
                        const storeQty = item.parentItemId ? 0 : item.stockQuantity
                        const barQty = isDrink ? item.barQuantity : 0
                        const totalQty = storeQty + barQty
                        return (
                          <tr key={item.id} style={{ borderTop: '1px solid var(--black-border)', background: isLow ? 'rgba(230,57,70,0.03)' : 'transparent' }}>
                            <td style={{ padding: '12px 16px', fontWeight: '500' }}>
                              {item.name}
                              {item.parentItemId && (
                                <div style={{ fontSize: '11px', color: 'var(--gold)', marginTop: '2px' }}>
                                  → linked to {items.find(i => i.id === item.parentItemId)?.name} ×{item.unitMultiplier}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>{isDrink ? '🍹' : '🍽'} {item.category?.name}</td>
                            
                            {/* Store Qty Cell - Shaded */}
                            <td style={{ padding: '12px 16px', background: 'rgba(201,168,76,0.03)', borderLeft: '1px solid rgba(201,168,76,0.1)', borderRight: '1px solid rgba(201,168,76,0.1)' }}>
                              {item.parentItemId ? (
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>see {items.find(i => i.id === item.parentItemId)?.name}</span>
                              ) : (
                                <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>{item.stockQuantity}</span>
                              )}
                            </td>
                            
                            {/* Bar Qty Cell - Shaded */}
                            <td style={{ padding: '12px 16px', background: 'rgba(82,183,136,0.03)', borderRight: '1px solid rgba(82,183,136,0.1)' }}>
                              {isDrink ? (
                                <span style={{ fontWeight: '700', fontSize: '16px', color: isLow ? 'var(--danger-light)' : 'var(--success-light)' }}>{item.barQuantity}</span>
                              ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                            </td>
                            
                            {/* Total Qty Cell - Shaded */}
                            <td style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.03)', borderRight: '1px solid rgba(59,130,246,0.1)' }}>
                              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>{totalQty}</span>
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              {isDrink ? (
                                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                                  {item.costPrice > 0 ? `${item.costPrice.toFixed(2)} ETB` : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Not set</span>}
                                </span>
                              ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)' }}>
                              {item.price.toFixed(2)} ETB
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {isDrink && item.costPrice > 0 ? (() => {
                                const margin = item.price - item.costPrice
                                const pct = ((margin / item.price) * 100).toFixed(0)
                                return <span style={{ fontSize: '13px', fontWeight: '700', color: margin >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>
                                  {margin >= 0 ? '+' : ''}{margin.toFixed(2)} ETB ({pct}%)
                                </span>
                              })() : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-secondary)' }}>{item.lowStockThreshold}</td>
                            <td style={{ padding: '12px 16px' }}>
                              {isLow ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--danger-light)', background: 'rgba(230,57,70,0.1)', padding: '3px 8px', borderRadius: '8px', fontWeight: '600' }}>
                                  <AlertTriangle size={11} /> LOW STOCK
                                </span>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--success-light)', background: 'rgba(82,183,136,0.1)', padding: '3px 8px', borderRadius: '8px' }}>OK</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {isDrink && <button className="btn btn-gold btn-sm" onClick={() => { setTransferTarget(item); setTransferQty('') }}>Transfer to Bar</button>}
                                <button className="btn btn-outline btn-sm" onClick={() => { setAdjustTarget(item); setAdjustQty(''); setAdjustCostPrice(item.costPrice > 0 ? String(item.costPrice) : '') }}>Update Store</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {/* Highlighted Totals Row */}
                      <tr style={{ background: 'var(--black-hover)', borderTop: '2px solid var(--gold)', fontWeight: '700' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--gold)' }}>TOTALS</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>-</td>
                        <td style={{ padding: '12px 16px', background: 'rgba(201,168,76,0.12)', borderLeft: '1px solid rgba(201,168,76,0.15)', borderRight: '1px solid rgba(201,168,76,0.15)', fontSize: '16px', color: 'var(--text-primary)' }}>
                          {filteredStoreQty}
                        </td>
                        <td style={{ padding: '12px 16px', background: 'rgba(82,183,136,0.12)', borderRight: '1px solid rgba(82,183,136,0.15)', fontSize: '16px', color: 'var(--text-primary)' }}>
                          {filteredBarQty}
                        </td>
                        <td style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.12)', borderRight: '1px solid rgba(59,130,246,0.15)', fontSize: '16px', color: 'var(--text-primary)' }}>
                          {filteredTotalQty}
                        </td>
                        <td colSpan={6} style={{ padding: '12px 16px' }}></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View Cards */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {loadingItems ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
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
                        {isDrink ? '🍹' : '🍽'} {item.category?.name}
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
                      {isDrink ? (
                        <span style={{ fontWeight: '700', fontSize: '15px', color: isLow ? 'var(--danger-light)' : 'var(--success-light)' }}>{item.barQuantity}</span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </div>
                    <div style={{ background: 'rgba(59,130,246,0.04)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.1)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Total Qty</span>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{totalQty}</span>
                    </div>
                    
                    <div style={{ gridColumn: 'span 1', marginTop: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>Cost Price</span>
                      {isDrink && item.costPrice > 0 ? (
                        <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{item.costPrice.toFixed(2)} ETB</span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </div>
                    <div style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>Sell Price</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.price.toFixed(2)} ETB</span>
                    </div>
                    <div style={{ gridColumn: 'span 3', marginTop: '4px', borderTop: '1px solid var(--black-border)', paddingTop: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Profit Margin</span>
                      {isDrink && item.costPrice > 0 ? (() => {
                        const margin = item.price - item.costPrice
                        const pct = ((margin / item.price) * 100).toFixed(0)
                        return (
                          <span style={{ fontWeight: '700', color: margin >= 0 ? 'var(--success-light)' : 'var(--danger-light)' }}>
                            {margin >= 0 ? '+' : ''}{margin.toFixed(2)} ETB ({pct}%)
                          </span>
                        )
                      })() : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    {isDrink && (
                      <button className="btn btn-gold btn-sm" style={{ flex: 1, padding: '10px 0' }} onClick={() => { setTransferTarget(item); setTransferQty('') }}>
                        Transfer
                      </button>
                    )}
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
          {lowIngCount > 0 && (
            <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid var(--danger-light)', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertTriangle size={20} color="var(--danger-light)" />
              <div>
                <div style={{ fontWeight: '600', color: 'var(--danger-light)' }}>{lowIngCount} ingredient{lowIngCount > 1 ? 's' : ''} running low!</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>Restock before serving affected dishes.</div>
              </div>
            </div>
          )}

          {/* Desktop Table View */}
          <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)' }}>
                    {['Ingredient', 'Unit', 'In Stock', 'Min Threshold', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingIngs ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</td></tr>
                  ) : ingredients.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No ingredients yet. Click <strong>Add Ingredient</strong> to start.
                    </td></tr>
                  ) : filteredIngredients.map(ing => {
                    const isLow = ing.quantity <= ing.minThreshold
                    return (
                      <tr key={ing.id} style={{ borderTop: '1px solid var(--black-border)', background: isLow ? 'rgba(230,57,70,0.03)' : 'transparent' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '500' }}>
                          {isLow && <span style={{ color: 'var(--danger-light)', marginRight: '6px' }}>⚠</span>}
                          {ing.name}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>{ing.unit}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontWeight: '700', fontSize: '16px', color: isLow ? 'var(--danger-light)' : 'var(--success-light)' }}>
                            {ing.quantity}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-secondary)' }}>{ing.minThreshold}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {isLow ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--danger-light)', background: 'rgba(230,57,70,0.1)', padding: '3px 8px', borderRadius: '8px', fontWeight: '600' }}>
                              <AlertTriangle size={11} /> LOW
                            </span>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--success-light)', background: 'rgba(82,183,136,0.1)', padding: '3px 8px', borderRadius: '8px' }}>OK</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }} onClick={() => openEditIng(ing)}><Pencil size={13} /></button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '6px 10px', color: 'var(--danger-light)' }} onClick={() => deleteIngredient(ing.id)}><Trash2 size={13} /></button>
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
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
            ) : ingredients.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No ingredients yet. Click <strong>Add Ingredient</strong> to start.
              </div>
            ) : filteredIngredients.map(ing => {
              const isLow = ing.quantity <= ing.minThreshold
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', background: 'var(--black-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--black-border)' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>In Stock</span>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: isLow ? 'var(--danger-light)' : 'var(--success-light)' }}>
                        {ing.quantity}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block' }}>Min Threshold</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{ing.minThreshold}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button className="btn btn-outline btn-sm" style={{ flex: 1, padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }} onClick={() => openEditIng(ing)}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, padding: '10px 0', color: 'var(--danger-light)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }} onClick={() => deleteIngredient(ing.id)}>
                      <Trash2 size={14} /> Delete
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
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--black-hover)' }}>
                    {['Date & Time', 'Item Name', 'Source/Type', 'Action', 'Qty Changed', 'Prev Qty', 'New Qty', 'User'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No logs found.</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} style={{ borderTop: '1px solid var(--black-border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {new Date(log.createdAt).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--text-primary)' }}>{log.itemName}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className="badge badge-outline" style={{ fontSize: '11px' }}>{log.type}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge ${
                          log.action === 'ADD' || log.action === 'INITIAL' ? 'badge-free' : 
                          log.action === 'TRANSFER' ? 'badge-occupied' : 'badge-open'
                        }`} style={{ fontSize: '11px' }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: '700', color: (log.action === 'ADD' || log.action === 'INITIAL') ? 'var(--success)' : 'var(--text-primary)' }}>
                        {(log.action === 'ADD' || log.action === 'INITIAL') ? `+${log.quantity}` : log.quantity}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{log.prevQty}</td>
                      <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-primary)' }}>{log.newQty}</td>
                      <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-primary)' }}>{log.userName}</td>
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
            ) : logs.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No logs found.</div>
            ) : logs.map(log => (
              <div key={log.id} className="card" style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{log.itemName}</span>
                  <span className={`badge ${
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
                    Qty: <b style={{ color: (log.action === 'ADD' || log.action === 'INITIAL') ? 'var(--success)' : 'inherit' }}>{(log.action === 'ADD' || log.action === 'INITIAL') ? `+${log.quantity}` : log.quantity}</b> 
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px', marginLeft: '6px' }}>({log.prevQty} → {log.newQty})</span>
                  </div>
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
            {adjustTarget.category?.type === 'DRINK' && (
              <>
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
              </>
            )}
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Transfer to Bar</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
              {transferTarget.name} <br/>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Store Qty: {transferTarget.stockQuantity} | Bar Qty: {transferTarget.barQuantity}</span>
            </p>
            <label className="input-label">Quantity to move from Store to Bar</label>
            <input className="input" type="number" placeholder="e.g. 24" value={transferQty} onChange={e => setTransferQty(e.target.value)} autoFocus style={{ marginBottom: '20px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={handleTransfer} disabled={!transferQty || parseInt(transferQty) <= 0 || parseInt(transferQty) > transferTarget.stockQuantity}>
                Confirm Transfer
              </button>
              <button className="btn btn-ghost" onClick={() => setTransferTarget(null)}>Cancel</button>
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
                <label className="input-label">Current Stock</label>
                <input className="input" type="number" value={ingForm.quantity} onChange={e => setIngForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Low Stock Alert At</label>
                <input className="input" type="number" value={ingForm.minThreshold} onChange={e => setIngForm(f => ({ ...f, minThreshold: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={saveIngredient}>{editIng ? 'Save Changes' : 'Add Ingredient'}</button>
              <button className="btn btn-ghost" onClick={() => setShowIngForm(false)}>Cancel</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  )
}
