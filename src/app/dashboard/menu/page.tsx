'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Eye, EyeOff, Search } from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import Portal from '@/components/Portal'

interface Category { id: string; name: string; type: string }
interface Ingredient { id: string; name: string; unit: string; currentStock: number }
interface MenuItem { id: string; name: string; description?: string; price: number; available: boolean; stockQuantity: number; lowStockThreshold: number; category: Category; recipes?: any[]; parentItemId?: string | null; unitMultiplier?: number }

const EMPTY_FORM = { name: '', description: '', price: '', categoryId: '', available: true, stockQuantity: '0', lowStockThreshold: '5', parentItemId: '', unitMultiplier: '1' }

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<MenuItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formRecipes, setFormRecipes] = useState<{ingredientId: string, quantity: string}[]>([])
  const [filterCat, setFilterCat] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)
  const [catForm, setCatForm] = useState({ id: '', name: '', type: 'FOOD' })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [catDeleteTarget, setCatDeleteTarget] = useState<Category | null>(null)
  const [deletingCat, setDeletingCat] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, cRes, ingRes] = await Promise.all([
        fetch('/api/menu-items', { cache: 'no-store' }),
        fetch('/api/categories', { cache: 'no-store' }),
        fetch('/api/ingredients', { cache: 'no-store' })
      ])
      if (iRes.ok) setItems(await iRes.json())
      if (cRes.ok) setCategories(await cRes.json())
      if (ingRes.ok) setIngredients(await ingRes.json())
    } catch {
      toast.error('Failed to load menu items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()

    const handleSync = () => { load() }
    window.addEventListener('cloud-pull-complete', handleSync)
    window.addEventListener('sync-complete', handleSync)
    const interval = setInterval(handleSync, 20_000)

    return () => {
      window.removeEventListener('cloud-pull-complete', handleSync)
      window.removeEventListener('sync-complete', handleSync)
      clearInterval(interval)
    }
  }, [load])

  function openNew() { setEditItem(null); setForm(EMPTY_FORM); setFormRecipes([]); setErrorMsg(''); setShowForm(true) }
  function openEdit(item: MenuItem) {
    setEditItem(item)
    setForm({
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      categoryId: item.category?.id || '',
      available: item.available,
      stockQuantity: item.stockQuantity.toString(),
      lowStockThreshold: item.lowStockThreshold.toString(),
      parentItemId: item.parentItemId || '',
      unitMultiplier: (item.unitMultiplier || 1).toString()
    })
    setFormRecipes(item.recipes ? item.recipes.map(r => ({ ingredientId: r.ingredientId, quantity: r.quantity.toString() })) : [])
    setErrorMsg('')
    setShowForm(true)
  }

  async function saveItem() {
    if (!form.name.trim()) {
      setErrorMsg('Item name is required')
      toast.error('Item name is required')
      return
    }
    const priceVal = parseFloat(form.price)
    if (isNaN(priceVal) || priceVal < 0) {
      setErrorMsg('Please enter a valid price')
      toast.error('Please enter a valid price')
      return
    }

    setSaving(true)
    setErrorMsg('')
    const data = {
      name: form.name.trim(),
      description: form.description?.trim() || '',
      price: priceVal,
      available: form.available,
      stockQuantity: parseInt(form.stockQuantity) || 0,
      lowStockThreshold: parseInt(form.lowStockThreshold) || 5,
      categoryId: form.categoryId?.trim() ? form.categoryId.trim() : null,
      parentItemId: form.parentItemId?.trim() ? form.parentItemId.trim() : null,
      unitMultiplier: parseFloat(form.unitMultiplier) || 1,
      recipes: formRecipes.filter(r => r.ingredientId).map(r => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) || 0 }))
    }
    
    try {
      let res;
      if (editItem) {
        res = await fetch(`/api/menu-items/${editItem.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      } else {
        res = await fetch('/api/menu-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      }
      
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        const msg = error || 'Failed to save item'
        setErrorMsg(msg)
        toast.error(msg)
        setSaving(false)
        return
      }

      const savedItem = await res.json()
      toast.success(editItem ? 'Menu item updated!' : 'Menu item created!')
      setShowForm(false)

      // Optimistically update list so the user immediately sees the change without waiting
      setItems(prev => {
        if (editItem) {
          return prev.map(i => i.id === savedItem.id ? { ...i, ...savedItem } : i)
        }
        return [savedItem, ...prev]
      })

      load()
    } catch {
      toast.error('Network error saving menu item')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteItem() {
    if (!deleteTarget) return
    setDeleting(true)
    setErrorMsg('')
    const targetId = deleteTarget.id
    const targetName = deleteTarget.name
    try {
      const res = await fetch(`/api/menu-items/${targetId}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        const msg = error || 'Failed to delete item'
        setErrorMsg(msg)
        toast.error(msg)
        setDeleting(false)
        return
      }
      toast.success(`"${targetName}" deleted successfully`)
      setItems(prev => prev.filter(i => i.id !== targetId))
      setDeleteTarget(null)
      load()
    } catch {
      toast.error('Network error deleting item')
    } finally {
      setDeleting(false)
    }
  }

  async function toggleAvailable(item: MenuItem) {
    try {
      const nextAvailable = !item.available
      const res = await fetch(`/api/menu-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: nextAvailable })
      })
      if (res.ok) {
        toast.info(`${item.name} marked ${nextAvailable ? 'Available' : 'Unavailable'}`)
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, available: nextAvailable } : i))
        load()
      } else {
        toast.error('Failed to update item availability')
      }
    } catch {
      toast.error('Network error updating item')
    }
  }

  async function addCategory() {
    if (!catForm.name.trim()) {
      setErrorMsg('Category name is required')
      toast.error('Category name is required')
      return
    }
    setErrorMsg('')
    try {
      let res;
      if (catForm.id) {
        res = await fetch(`/api/categories/${catForm.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: catForm.name.trim(), type: catForm.type }) })
      } else {
        res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: catForm.name.trim(), type: catForm.type }) })
      }
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        const msg = error || 'Failed to save category'
        setErrorMsg(msg)
        toast.error(msg)
        return
      }
      const savedCat = await res.json()
      toast.success(catForm.id ? 'Category updated!' : 'Category created!')
      setCatForm({ id: '', name: '', type: 'FOOD' })
      setShowCatForm(false)
      setCategories(prev => {
        if (catForm.id) {
          return prev.map(c => c.id === savedCat.id ? savedCat : c)
        }
        return [...prev, savedCat]
      })
      load()
    } catch {
      toast.error('Network error saving category')
    }
  }

  async function confirmDeleteCategory() {
    if (!catDeleteTarget) return
    setDeletingCat(true)
    setErrorMsg('')
    const targetId = catDeleteTarget.id
    const targetName = catDeleteTarget.name
    try {
      const res = await fetch(`/api/categories/${targetId}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        const msg = error || 'Failed to delete category'
        setErrorMsg(msg)
        toast.error(msg)
        setDeletingCat(false)
        return
      }
      toast.success(`Category "${targetName}" deleted`)
      setCategories(prev => prev.filter(c => c.id !== targetId))
      setCatDeleteTarget(null)
      load()
    } catch {
      toast.error('Network error deleting category')
    } finally {
      setDeletingCat(false)
    }
  }

  const filtered = items.filter(i => {
    if (filterCat && i.category?.id !== filterCat) return false
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}><span className="gold-text">Menu Management</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>{items.length} items · {categories.length} categories</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={() => { setErrorMsg(''); setCatForm({ id: '', name: '', type: 'FOOD' }); setShowCatForm(true); }}><Plus size={14} /> Manage Categories</button>
          <button className="btn btn-gold btn-sm" onClick={() => { setErrorMsg(''); openNew(); }}><Plus size={14} /> Add Item</button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid var(--danger-light)', borderRadius: '8px', padding: '12px 16px', color: 'var(--danger-light)', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ⚠ {errorMsg}
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button className={`btn btn-sm ${!filterCat ? 'btn-gold' : 'btn-outline'}`} onClick={() => setFilterCat('')}>All</button>
          {categories.map(c => (
            <button key={c.id} className={`btn btn-sm ${filterCat === c.id ? 'btn-gold' : 'btn-outline'}`} onClick={() => setFilterCat(c.id)}>
              {c.type === 'FOOD' ? '🍽' : '🍹'} {c.name}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search menu items..."
            className="input"
            style={{ paddingLeft: '36px', height: '36px', fontSize: '13px' }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Items Table — Desktop */}
      <div className="card desktop-only-table" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--black-hover)' }}>
                {['Item', 'Category', 'Price (ETB)', 'Stock', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No items found.</td></tr>
              ) : filtered.map((item, i) => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--black-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: '500' }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.description}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {item.category?.type === 'FOOD' ? '🍽' : '🍹'} {item.category?.name || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--gold)', fontWeight: '600' }}>{item.price.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ color: item.stockQuantity <= item.lowStockThreshold ? 'var(--danger-light)' : 'var(--text-primary)', fontWeight: item.stockQuantity <= item.lowStockThreshold ? '700' : '400' }}>
                      {item.stockQuantity} {item.stockQuantity <= item.lowStockThreshold && '⚠'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => toggleAvailable(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: item.available ? 'var(--success-light)' : 'var(--text-muted)', fontSize: '13px' }}>
                      {item.available ? <Eye size={14} /> : <EyeOff size={14} />}
                      {item.available ? 'Available' : 'Hidden'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }} onClick={() => openEdit(item)} title="Edit item"><Pencil size={13} /></button>
                      <button className="btn btn-danger btn-sm" style={{ padding: '6px 10px' }} onClick={() => setDeleteTarget(item)} title="Delete item"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Items Cards — Mobile */}
      <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No items found.</div>
        ) : filtered.map(item => {
          const isLowStock = item.stockQuantity <= item.lowStockThreshold
          return (
            <div
              key={item.id}
              className="card"
              style={{
                background: 'var(--black-card)',
                border: isLowStock ? '1px solid var(--danger-light)' : '1px solid var(--black-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {/* Top row: name + status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{item.name}</div>
                  {item.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {item.category?.type === 'FOOD' ? '🍽' : '🍹'} {item.category?.name || '—'}
                  </div>
                </div>
                <button
                  onClick={() => toggleAvailable(item)}
                  style={{
                    background: item.available ? 'rgba(16,185,129,0.1)' : 'rgba(122,112,96,0.15)',
                    border: 'none', cursor: 'pointer', borderRadius: '8px',
                    padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px',
                    color: item.available ? 'var(--success-light)' : 'var(--text-muted)',
                    fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0
                  }}
                >
                  {item.available ? <Eye size={12} /> : <EyeOff size={12} />}
                  {item.available ? 'Available' : 'Hidden'}
                </button>
              </div>

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '13px', background: 'var(--black-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--black-border)' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Price</span>
                  <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--gold)' }}>{item.price.toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Stock</span>
                  <span style={{ fontWeight: '700', fontSize: '15px', color: isLowStock ? 'var(--danger-light)' : 'var(--text-primary)' }}>
                    {item.stockQuantity} {isLowStock && '⚠'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600' }}>Alert At</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{item.lowStockThreshold}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline btn-sm" style={{ flex: 1, padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }} onClick={() => openEdit(item)}>
                  <Pencil size={14} /> Edit
                </button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1, padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }} onClick={() => setDeleteTarget(item)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Item Form Modal */}
      {showForm && (
        <Portal><div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editItem ? 'Edit Item' : 'New Menu Item'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Item Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tibs" />
              </div>
              <div>
                <label className="input-label">Price (ETB)</label>
                <input className="input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="input-label">Category</label>
                <select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Description (optional)</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
              </div>
              <div>
                <label className="input-label">Stock Quantity</label>
                <input className="input" type="number" value={form.stockQuantity} onChange={e => setForm(f => ({ ...f, stockQuantity: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Low Stock Alert At</label>
                <input className="input" type="number" value={form.lowStockThreshold} onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value }))} />
              </div>
              
              {/* Unit Linking Section */}
              <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--black-border)', paddingTop: '16px', marginTop: '4px' }}>
                <label className="input-label" style={{ marginBottom: '4px' }}>Unit Size Link (Optional)</label>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>Link this item to a parent item. E.g. "Jambo" links to "Single" with multiplier 3.</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 2 }}>
                    <label className="input-label">Parent Item</label>
                    <select className="input" value={form.parentItemId} onChange={e => setForm(f => ({ ...f, parentItemId: e.target.value }))}>
                      <option value="">None (standalone item)</option>
                      {items.filter(i => !editItem || i.id !== editItem.id).map(i => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="input-label">Multiplier</label>
                    <input className="input" type="number" min="0.01" step="0.01" value={form.unitMultiplier} onChange={e => setForm(f => ({ ...f, unitMultiplier: e.target.value }))} disabled={!form.parentItemId} placeholder="e.g. 1.5" />
                  </div>
                </div>
                {form.parentItemId && <p style={{ fontSize: '12px', color: 'var(--gold)', marginTop: '6px' }}>✓ 1 {form.name || 'this item'} = {form.unitMultiplier}× {items.find(i => i.id === form.parentItemId)?.name || '...'}</p>}
              </div>

              {/* Recipe Section */}
              <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--black-border)', paddingTop: '16px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label className="input-label" style={{ marginBottom: 0 }}>Recipe / Ingredients (Optional)</label>
                  <button className="btn btn-outline btn-sm" onClick={() => setFormRecipes([...formRecipes, { ingredientId: '', quantity: '1' }])}><Plus size={12}/> Add Ingredient</button>
                </div>
                {formRecipes.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No ingredients linked. Used for inventory tracking.</div>}
                {formRecipes.map((fr, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <select className="input" style={{ flex: 1 }} value={fr.ingredientId} onChange={e => {
                      const newR = [...formRecipes]; newR[idx].ingredientId = e.target.value; setFormRecipes(newR);
                    }}>
                      <option value="">Select ingredient...</option>
                      {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
                    </select>
                    <input className="input" style={{ width: '100px' }} type="number" step="any" placeholder="Qty" value={fr.quantity} onChange={e => {
                      const newR = [...formRecipes]; newR[idx].quantity = e.target.value; setFormRecipes(newR);
                    }} />
                    <button className="btn btn-outline btn-sm" style={{ padding: '0 10px', color: 'var(--danger-light)', borderColor: 'var(--danger-light)' }} onClick={() => {
                      const newR = [...formRecipes]; newR.splice(idx, 1); setFormRecipes(newR);
                    }}><Trash2 size={14}/></button>
                  </div>
                ))}
              </div>
              
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={saveItem} disabled={saving}>{saving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Item'}</button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Category Form Modal */}
      {showCatForm && (
        <Portal><div className="modal-overlay" onClick={() => setShowCatForm(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Manage Categories</h3>
            
            {errorMsg && (
              <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid var(--danger-light)', borderRadius: '8px', padding: '12px 16px', color: 'var(--danger-light)', fontSize: '13px', marginBottom: '16px' }}>
                ⚠ {errorMsg}
              </div>
            )}

            <div style={{ marginBottom: '24px', background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--black-border)', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Existing Categories</div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px' }}>
                {categories.length === 0 && <div style={{ padding: '12px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>No categories yet</div>}
                {categories.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{c.type === 'FOOD' ? '🍽' : '🍹'} {c.name}</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => setCatForm({ id: c.id, name: c.name, type: c.type })}><Pencil size={13} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', color: 'var(--danger-light)' }} onClick={() => setCatDeleteTarget(c)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--black-border)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>{catForm.id ? 'Edit Category' : 'Add New Category'}</h4>
              <div style={{ marginBottom: '12px' }}>
                <label className="input-label">Category Name</label>
                <input className="input" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Starters, Beer, Cocktails" />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label className="input-label">Type</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className={`btn btn-sm ${catForm.type === 'FOOD' ? 'btn-gold' : 'btn-outline'}`} onClick={() => setCatForm(f => ({ ...f, type: 'FOOD' }))}>🍽 Food</button>
                  <button className={`btn btn-sm ${catForm.type === 'DRINK' ? 'btn-gold' : 'btn-outline'}`} onClick={() => setCatForm(f => ({ ...f, type: 'DRINK' }))}>🍹 Drink</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={addCategory}>{catForm.id ? 'Save Changes' : 'Add Category'}</button>
                {catForm.id && <button className="btn btn-outline" onClick={() => setCatForm({ id: '', name: '', type: 'FOOD' })}>Cancel Edit</button>}
                <button className="btn btn-ghost" onClick={() => setShowCatForm(false)}>Close</button>
              </div>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Delete Item Confirmation Modal */}
      {deleteTarget && (
        <Portal>
          <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="modal" style={{ maxWidth: '420px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(230,57,70,0.1)', color: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Trash2 size={24} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Delete Menu Item</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px', lineHeight: '1.5' }}>
                Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>"{deleteTarget.name}"</strong>? This will permanently remove it from the menu and inventory.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, padding: '12px 0' }}
                  onClick={confirmDeleteItem}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete Item'}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Delete Category Confirmation Modal */}
      {catDeleteTarget && (
        <Portal>
          <div className="modal-overlay" onClick={() => !deletingCat && setCatDeleteTarget(null)}>
            <div className="modal" style={{ maxWidth: '420px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(230,57,70,0.1)', color: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Trash2 size={24} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Delete Category</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px', lineHeight: '1.5' }}>
                Are you sure you want to delete category <strong style={{ color: 'var(--text-primary)' }}>"{catDeleteTarget.name}"</strong>?
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, padding: '12px 0' }}
                  onClick={confirmDeleteCategory}
                  disabled={deletingCat}
                >
                  {deletingCat ? 'Deleting...' : 'Yes, Delete Category'}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => setCatDeleteTarget(null)}
                  disabled={deletingCat}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

    </div>
  )
}
