'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, ChefHat, Search, ArrowLeft } from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import Portal from '@/components/Portal'

interface Ingredient { id: string; name: string; unit: string; quantity: number; minThreshold: number }
interface RecipeLine { id: string; ingredientId: string; quantity: number; ingredient: Ingredient }
interface MenuItem { id: string; name: string; description?: string; category?: { name: string; type: string } | null }

const UNITS = ['grams', 'kg', 'ml', 'liters', 'pieces', 'cups', 'tbsp', 'tsp']

export default function RecipesPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const [recipe, setRecipe] = useState<RecipeLine[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New ingredient form
  const [addIngForm, setAddIngForm] = useState({ ingredientId: '', quantity: '' })

  // New ingredient creation
  const [showNewIng, setShowNewIng] = useState(false)
  const [newIng, setNewIng] = useState({ name: '', unit: 'grams', quantity: '0', minThreshold: '0' })

  const loadBase = useCallback(async () => {
    try {
      const [menuRes, ingRes] = await Promise.all([
        fetch('/api/menu-items'),
        fetch('/api/ingredients'),
      ])
      if (menuRes.ok && ingRes.ok) {
        const items = await menuRes.json()
        setMenuItems(items)
        setIngredients(await ingRes.json())
      } else {
        console.error('Failed to load menu items or ingredients:', menuRes.statusText, ingRes.statusText)
      }
    } catch (err) {
      console.error('Error loading base recipe data:', err)
    }
  }, [])

  const loadRecipe = useCallback(async (item: MenuItem, isSilent = false) => {
    if (!isSilent) setLoading(true)
    setError('')
    setSelected(item)
    try {
      const res = await fetch(`/api/recipes?menuItemId=${item.id}`)
      if (res.ok) {
        setRecipe(await res.json())
      } else {
        console.error('Failed to load recipe:', res.statusText)
        if (!isSilent) setError('Failed to load recipe')
      }
    } catch (err) {
      console.error('Error loading recipe:', err)
      if (!isSilent) setError('Error loading recipe')
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBase()

    const handleSync = () => {
      loadBase()
      if (selected) loadRecipe(selected, true)
    }

    window.addEventListener('cloud-pull-complete', handleSync)
    window.addEventListener('sync-complete', handleSync)

    return () => {
      window.removeEventListener('cloud-pull-complete', handleSync)
      window.removeEventListener('sync-complete', handleSync)
    }
  }, [loadBase, selected, loadRecipe])

  async function addLine() {
    if (!selected || !addIngForm.ingredientId || !addIngForm.quantity) return
    setError('')
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: selected.id,
          ingredientId: addIngForm.ingredientId,
          quantity: parseFloat(addIngForm.quantity),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); toast.error(data.error || 'Failed to add ingredient'); return }
      toast.success('Ingredient added to recipe')
      setAddIngForm({ ingredientId: '', quantity: '' })
      loadRecipe(selected)
    } catch {
      toast.error('Network error adding ingredient')
    }
  }

  async function removeLine(id: string) {
    if (!confirm('Remove this ingredient from the recipe?')) return
    try {
      await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
      toast.success('Ingredient removed from recipe')
      if (selected) loadRecipe(selected)
    } catch {
      toast.error('Network error removing ingredient')
    }
  }

  async function updateQty(id: string, qty: number) {
    try {
      await fetch(`/api/recipes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      })
      if (selected) loadRecipe(selected)
    } catch {
      toast.error('Network error updating quantity')
    }
  }

  async function createIngredient() {
    if (!newIng.name.trim()) return
    try {
      const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newIng.name.trim(),
          unit: newIng.unit,
          quantity: parseFloat(newIng.quantity),
          minThreshold: parseFloat(newIng.minThreshold),
        }),
      })
      const data = await res.json()
      setIngredients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setAddIngForm(f => ({ ...f, ingredientId: data.id }))
      setNewIng({ name: '', unit: 'grams', quantity: '0', minThreshold: '0' })
      setShowNewIng(false)
      toast.success('Ingredient created!')
    } catch {
      toast.error('Network error creating ingredient')
    }
  }

  const filtered = menuItems.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  // Desktop: side-by-side layout. Mobile: single column with back navigation.
  return (
    <div className="animate-fade-in">

      {/* ══════════════════════════════════ */}
      {/* DESKTOP LAYOUT: sidebar + editor  */}
      {/* ══════════════════════════════════ */}
      <div className="desktop-only" style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 48px)' }}>
        {/* Left: Menu item list */}
        <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--black-border)' }}>
            <h2 className="font-cinzel" style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px' }}>
              <span className="gold-text">Menu Items</span>
            </h2>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                style={{ paddingLeft: '30px', fontSize: '13px' }}
                placeholder="Search dishes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {filtered.map(item => (
              <div
                key={item.id}
                onClick={() => loadRecipe(item)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: selected?.id === item.id ? 'rgba(201,168,76,0.1)' : 'transparent',
                  border: selected?.id === item.id ? '1px solid rgba(201,168,76,0.3)' : '1px solid transparent',
                  marginBottom: '4px',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: '500', color: selected?.id === item.id ? 'var(--gold)' : 'var(--text-primary)' }}>
                  {item.category?.type === 'FOOD' ? '🍽' : item.category?.type === 'DRINK' ? '🍹' : '📦'} {item.name}
                </div>
                {item.category && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.category.name}</div>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>No items found</div>
            )}
          </div>
        </div>

        {/* Right: Recipe editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px' }}>
              <ChefHat size={48} style={{ opacity: 0.3 }} />
              <p>Select a menu item to manage its recipe</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom: '20px' }}>
                <h1 className="font-cinzel" style={{ fontSize: '20px', fontWeight: '700' }}>
                  <span className="gold-text">Recipe:</span>{' '}
                  <span style={{ color: 'var(--text-primary)' }}>{selected.name}</span>
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {recipe.length} ingredient{recipe.length !== 1 ? 's' : ''} defined
                </p>
              </div>

              {error && (
                <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid var(--danger-light)', borderRadius: '8px', padding: '12px 16px', color: 'var(--danger-light)', fontSize: '13px', marginBottom: '16px' }}>
                  ⚠ {error}
                </div>
              )}

              {/* Ingredient lines — Desktop table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px', flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--black-hover)' }}>
                      {['Ingredient', 'Qty per serving', 'Unit', 'Current Stock', ''].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>Loading...</td></tr>
                    ) : recipe.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        No ingredients defined yet. Add one below.
                      </td></tr>
                    ) : recipe.map((line, i) => {
                      const isLow = line.ingredient.quantity <= line.ingredient.minThreshold
                      return (
                        <tr key={line.id} style={{ borderTop: '1px solid var(--black-border)', background: isLow ? 'rgba(230,57,70,0.02)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '500' }}>
                            {isLow && <span style={{ color: 'var(--danger-light)', marginRight: '6px' }}>⚠</span>}
                            {line.ingredient.name}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <input
                              type="number"
                              defaultValue={line.quantity}
                              onBlur={e => updateQty(line.id, parseFloat(e.target.value))}
                              style={{ background: 'var(--black-hover)', border: '1px solid var(--black-border)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)', width: '80px', fontSize: '14px' }}
                            />
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>{line.ingredient.unit}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ color: isLow ? 'var(--danger-light)' : 'var(--success-light)', fontWeight: '600' }}>
                              {line.ingredient.quantity} {line.ingredient.unit}
                            </span>
                            {isLow && <span style={{ fontSize: '11px', color: 'var(--danger-light)', display: 'block' }}>LOW STOCK</span>}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-light)', padding: '4px 8px' }} onClick={() => removeLine(line.id)}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add ingredient to recipe */}
              <div className="card" style={{ flexShrink: 0 }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '14px' }}>Add Ingredient to Recipe</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: 2, minWidth: '180px' }}>
                    <label className="input-label">Ingredient</label>
                    <select className="input" value={addIngForm.ingredientId} onChange={e => setAddIngForm(f => ({ ...f, ingredientId: e.target.value }))}>
                      <option value="">Select ingredient...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '100px' }}>
                    <label className="input-label">Qty per serving</label>
                    <input className="input" type="number" placeholder="e.g. 200" value={addIngForm.quantity} onChange={e => setAddIngForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <button className="btn btn-gold" onClick={addLine} disabled={!addIngForm.ingredientId || !addIngForm.quantity}>
                    <Plus size={14} /> Add
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowNewIng(true)} title="Create new ingredient">
                    + New Ingredient
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════ */}
      {/* MOBILE LAYOUT: single column      */}
      {/* ══════════════════════════════════ */}
      <div className="mobile-only" style={{ paddingBottom: '24px' }}>

        {/* When NO item is selected on mobile — show the full list */}
        {!selected ? (
          <>
            <div style={{ marginBottom: '16px' }}>
              <h1 className="font-cinzel" style={{ fontSize: '20px', fontWeight: '700' }}>
                <span className="gold-text">Recipes</span>
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                {menuItems.length} menu items · Select to manage recipe
              </p>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                style={{ paddingLeft: '36px', fontSize: '14px' }}
                placeholder="Search menu items..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Item cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(item => (
                <div
                  key={item.id}
                  className="card card-hover"
                  onClick={() => loadRecipe(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(201,168,76,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                    {item.category?.type === 'FOOD' ? '🍽' : item.category?.type === 'DRINK' ? '🍹' : '📦'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>{item.name}</div>
                    {item.category && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.category.name}</div>}
                  </div>
                  <ChefHat size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No items found</div>
              )}
            </div>
          </>
        ) : (
          /* When an item IS selected on mobile — show the recipe editor */
          <>
            {/* Back button + header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '8px', borderRadius: '10px' }}
                onClick={() => { setSelected(null); setRecipe([]); setError('') }}
              >
                <ArrowLeft size={20} />
              </button>
              <div style={{ flex: 1 }}>
                <h1 className="font-cinzel" style={{ fontSize: '18px', fontWeight: '700' }}>
                  <span className="gold-text">Recipe:</span>{' '}
                  <span style={{ color: 'var(--text-primary)' }}>{selected.name}</span>
                </h1>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {recipe.length} ingredient{recipe.length !== 1 ? 's' : ''} defined
                </p>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid var(--danger-light)', borderRadius: '8px', padding: '12px 16px', color: 'var(--danger-light)', fontSize: '13px', marginBottom: '16px' }}>
                ⚠ {error}
              </div>
            )}

            {/* Ingredient cards — Mobile */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
              ) : recipe.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No ingredients defined yet. Add one below.
                </div>
              ) : recipe.map(line => {
                const isLow = line.ingredient.quantity <= line.ingredient.minThreshold
                return (
                  <div
                    key={line.id}
                    className="card"
                    style={{
                      background: 'var(--black-card)',
                      border: isLow ? '1px solid var(--danger-light)' : '1px solid var(--black-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    {/* Top row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                          {isLow && <span style={{ color: 'var(--danger-light)', marginRight: '4px' }}>⚠</span>}
                          {line.ingredient.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Unit: {line.ingredient.unit}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger-light)', padding: '6px 10px' }}
                        onClick={() => removeLine(line.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Info grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'var(--black-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--black-border)' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600', marginBottom: '4px' }}>Qty Per Serving</span>
                        <input
                          type="number"
                          defaultValue={line.quantity}
                          onBlur={e => updateQty(line.id, parseFloat(e.target.value))}
                          style={{ background: 'var(--black)', border: '1px solid var(--black-border)', borderRadius: '6px', padding: '8px 10px', color: 'var(--text-primary)', width: '100%', fontSize: '15px', fontWeight: '700' }}
                        />
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', display: 'block', fontWeight: '600', marginBottom: '4px' }}>Current Stock</span>
                        <div style={{ padding: '8px 10px', fontWeight: '700', fontSize: '15px', color: isLow ? 'var(--danger-light)' : 'var(--success-light)' }}>
                          {line.ingredient.quantity} {line.ingredient.unit}
                          {isLow && <span style={{ display: 'block', fontSize: '10px', color: 'var(--danger-light)', fontWeight: '600', marginTop: '2px' }}>LOW STOCK</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add ingredient form — Mobile */}
            <div className="card" style={{ position: 'sticky', bottom: '12px', zIndex: 10, boxShadow: '0 -4px 20px rgba(0,0,0,0.5)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Add Ingredient</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label className="input-label">Ingredient</label>
                  <select className="input" value={addIngForm.ingredientId} onChange={e => setAddIngForm(f => ({ ...f, ingredientId: e.target.value }))}>
                    <option value="">Select ingredient...</option>
                    {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Qty per serving</label>
                  <input className="input" type="number" placeholder="e.g. 200" value={addIngForm.quantity} onChange={e => setAddIngForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-gold" style={{ flex: 1 }} onClick={addLine} disabled={!addIngForm.ingredientId || !addIngForm.quantity}>
                    <Plus size={14} /> Add to Recipe
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowNewIng(true)} style={{ whiteSpace: 'nowrap' }}>
                    + New
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* New Ingredient Modal */}
      {showNewIng && (
        <Portal>
          <div className="modal-overlay" onClick={() => setShowNewIng(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>New Ingredient</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="input-label">Name</label>
                  <input className="input" placeholder="e.g. Beef, Tomato, Onion" value={newIng.name} onChange={e => setNewIng(f => ({ ...f, name: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label className="input-label">Unit</label>
                  <select className="input" value={newIng.unit} onChange={e => setNewIng(f => ({ ...f, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Starting Stock</label>
                  <input className="input" type="number" value={newIng.quantity} onChange={e => setNewIng(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="input-label">Low Stock Alert Threshold</label>
                  <input className="input" type="number" value={newIng.minThreshold} onChange={e => setNewIng(f => ({ ...f, minThreshold: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={createIngredient}>Create Ingredient</button>
                <button className="btn btn-ghost" onClick={() => setShowNewIng(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
