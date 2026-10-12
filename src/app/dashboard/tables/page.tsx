'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, RefreshCw, Merge, ArrowRightLeft, Trash2, Unlink } from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import Portal from '@/components/Portal'

interface Table {
  id: string
  number: string
  status: 'FREE' | 'OCCUPIED' | 'WAITING_PAYMENT'
  mergedWithId: string | null
  mergedWithNumber?: string | null
  mergedFromNumbers?: string[]
  isMerged?: boolean
}

const STATUS_COLORS = {
  FREE: { bg: 'rgba(82,183,136,0.12)', border: 'var(--success-light)', label: 'Free', badge: 'badge-free' },
  OCCUPIED: { bg: 'rgba(244,162,97,0.12)', border: 'var(--warning-light)', label: 'Occupied', badge: 'badge-occupied' },
  WAITING_PAYMENT: { bg: 'rgba(230,57,70,0.12)', border: 'var(--danger-light)', label: 'Waiting Payment', badge: 'badge-waiting' },
}

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<string[]>([])
  const [transferMode, setTransferMode] = useState(false)
  const [transferSelected, setTransferSelected] = useState<string[]>([])

  const load = useCallback(async (isBackground = false) => {
    // Only show full-page loading spinner on very first mount
    if (!hasLoadedRef.current && !isBackground) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const res = await fetch('/api/tables')
      if (res.ok) {
        const allTables: Table[] = await res.json()
        const isDineIn = (t: Table) => {
          const num = (t.number || '').trim().toLowerCase()
          if (num === 'archived' || num === 'delivery' || num === 'takeaway') return false
          if (num.startsWith('delivery') || num.startsWith('takeaway') || num.startsWith('dlv-') || num.startsWith('archived')) return false
          if (t.id === '__archived_orders_table__' || t.id.startsWith('tbl_static_')) return false
          return true
        }
        setTables(allTables.filter(isDineIn))
        hasLoadedRef.current = true
      } else {
        console.error('Failed to load tables:', res.statusText)
        if (!isBackground) toast.error('Failed to load floor tables')
      }
    } catch (err) {
      console.error('Error loading tables:', err)
      if (!isBackground) toast.error('Network error loading tables')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Silent auto-refresh when OfflineBanner pulls new cloud orders or completes sync
  useEffect(() => {
    const handleCloudPull = () => load(true)
    const handleSyncComplete = () => load(true)
    window.addEventListener('cloud-pull-complete', handleCloudPull)
    window.addEventListener('sync-complete', handleSyncComplete)

    // Poll every 30s silently so table status stays live across terminals with 0 screen flash
    const interval = setInterval(() => load(true), 30_000)

    return () => {
      window.removeEventListener('cloud-pull-complete', handleCloudPull)
      window.removeEventListener('sync-complete', handleSyncComplete)
      clearInterval(interval)
    }
  }, [load])

  async function addTable() {
    if (!newNumber.trim()) {
      toast.warning('Please enter a table number')
      return
    }
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: newNumber.trim() }),
      })
      if (res.ok) {
        toast.success(`Table ${newNumber.trim()} added successfully!`)
        setNewNumber('')
        setShowAdd(false)
        load()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to add table')
      }
    } catch {
      toast.error('Network error creating table')
    }
  }

  async function updateStatus(id: string, status: string) {
    const prevTables = [...tables]
    // Optimistic UI update: instantly update UI without waiting for network roundtrip
    setTables(prev => prev.map(t => t.id === id ? { ...t, status: status as any } : t))

    try {
      const res = await fetch(`/api/tables/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        toast.success(`Table status updated to ${status.replace('_', ' ')}`)
      } else {
        setTables(prevTables) // Revert on failure
        toast.error('Failed to update table status')
      }
    } catch {
      setTables(prevTables) // Revert on network error
      toast.error('Network error updating table status')
    }
  }

  async function deleteTable(id: string, number: string) {
    if (!confirm(`Delete Table ${number}? Any past order history will be safely preserved.`)) return
    const prevTables = [...tables]
    setTables(prev => prev.filter(t => t.id !== id)) // Optimistic delete

    try {
      const res = await fetch(`/api/tables/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTables(prevTables) // Revert on failure
        toast.error(data.error || 'Failed to delete table')
      } else {
        toast.success(`Table ${number} deleted`)
      }
    } catch {
      setTables(prevTables)
      toast.error('Network error deleting table')
    }
  }

  function handleMergeClick(id: string) {
    setMergeSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev)
  }

  async function confirmMerge() {
    if (mergeSelected.length !== 2) return
    const [sourceId, targetId] = mergeSelected
    try {
      const res = await fetch('/api/tables/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTableId: sourceId, targetTableId: targetId }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Tables merged successfully!')
        setMergeMode(false)
        setMergeSelected([])
        load()
      } else {
        toast.error(data.error || 'Failed to merge tables')
      }
    } catch {
      toast.error('Network error merging tables')
    }
  }

  async function unmergeTable(tableId: string) {
    try {
      const res = await fetch(`/api/tables/merge?tableId=${encodeURIComponent(tableId)}`, {
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

  function handleTransferClick(id: string) {
    setTransferSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev)
  }

  async function confirmTransfer() {
    if (transferSelected.length !== 2) return
    const [fromId, toId] = transferSelected
    try {
      // Get open order from source table
      const res = await fetch(`/api/orders?tableId=${fromId}&status=OPEN`)
      const orders = await res.json()
      if (orders.length > 0) {
        await fetch(`/api/orders/${orders[0].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId: toId }),
        })
        await fetch(`/api/tables/${fromId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'FREE' }),
        })
        await fetch(`/api/tables/${toId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'OCCUPIED' }),
        })
        toast.success('Order transferred to new table!')
      } else {
        toast.warning('No open order found on source table to transfer')
      }
      setTransferMode(false)
      setTransferSelected([])
      load()
    } catch {
      toast.error('Failed to transfer table order')
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}>
            <span className="gold-text">Floor Map</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            {tables.length} tables · {tables.filter(t => t.status === 'FREE').length} free · {tables.filter(t => t.status === 'OCCUPIED').length} occupied
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => load(false)}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
          <button className={`btn btn-sm ${mergeMode ? 'btn-gold' : 'btn-outline'}`} onClick={() => { setMergeMode(!mergeMode); setMergeSelected([]); setTransferMode(false) }}><Merge size={15} /> Merge</button>
          <button className={`btn btn-sm ${transferMode ? 'btn-gold' : 'btn-outline'}`} onClick={() => { setTransferMode(!transferMode); setTransferSelected([]); setMergeMode(false) }}><ArrowRightLeft size={15} /> Transfer</button>
          <button className="btn btn-gold btn-sm" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Table</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(STATUS_COLORS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: v.border }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{v.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--gold)' }} />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Merged / Linked</span>
        </div>
      </div>

      {/* Merge/Transfer instruction */}
      {(mergeMode || transferMode) && (
        <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '14px', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span>
            {mergeMode
              ? mergeSelected.length === 0
                ? 'Select first table to merge (0/2 selected)'
                : mergeSelected.length === 1
                ? `Table ${tables.find(t => t.id === mergeSelected[0])?.number} selected. Now select second table (1/2 selected)`
                : `Ready to merge Table ${tables.find(t => t.id === mergeSelected[0])?.number} & Table ${tables.find(t => t.id === mergeSelected[1])?.number} (2/2 selected)`
              : `Select source then destination table (${transferSelected.length}/2 selected)`}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {mergeMode && mergeSelected.length === 2 && (
              <button className="btn btn-gold btn-sm" onClick={confirmMerge}>
                Confirm Merge (T{tables.find(t => t.id === mergeSelected[0])?.number} + T{tables.find(t => t.id === mergeSelected[1])?.number})
              </button>
            )}
            {transferMode && transferSelected.length === 2 && <button className="btn btn-gold btn-sm" onClick={confirmTransfer}>Confirm Transfer</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => { setMergeMode(false); setTransferMode(false); setMergeSelected([]); setTransferSelected([]) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tables Grid */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', color: 'var(--text-muted)' }}>Loading tables...</div>
      ) : tables.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🪑</div>
          <p>No tables yet. Add your first table!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
          {tables.map(table => {
            const colors = STATUS_COLORS[table.status]
            const isMergeSelected = mergeSelected.includes(table.id)
            const isTransferSelected = transferSelected.includes(table.id)
            const isSelected = isMergeSelected || isTransferSelected
            const isMerged = Boolean(table.isMerged || table.mergedWithId || (table.mergedFromNumbers && table.mergedFromNumbers.length > 0))

            return (
              <div
                key={table.id}
                className="card-hover"
                onClick={() => {
                  if (mergeMode) handleMergeClick(table.id)
                  else if (transferMode) handleTransferClick(table.id)
                  else if (table.status === 'WAITING_PAYMENT') window.location.href = `/dashboard/payment`
                  else {
                    const targetTableId = table.mergedWithId || table.id
                    window.location.href = `/dashboard/orders/new?tableId=${targetTableId}`
                  }
                }}
                style={{
                  background: isSelected ? 'rgba(201,168,76,0.12)' : isMerged ? 'rgba(201,168,76,0.06)' : colors.bg,
                  border: `2px solid ${isSelected ? 'var(--gold)' : isMerged ? 'rgba(201,168,76,0.7)' : colors.border}`,
                  borderRadius: '12px',
                  padding: '16px 12px',
                  textAlign: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isMerged ? '0 0 12px rgba(201,168,76,0.15)' : undefined,
                }}
              >
                {isSelected && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--gold)', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--black)', fontWeight: '700' }}>✓</div>
                )}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>TABLE</div>
                <div style={{ fontSize: '26px', fontWeight: '700', fontFamily: 'Cinzel, serif', color: 'var(--text-primary)', marginBottom: '8px' }}>{table.number}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                  <span className={`badge ${colors.badge}`} style={{ fontSize: '10px', padding: '3px 8px' }}>{colors.label}</span>
                  {table.mergedWithId && (
                    <span className="badge" style={{ background: 'rgba(201,168,76,0.2)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.3)', fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Merge size={10} /> Joined with T{table.mergedWithNumber || '?'}
                    </span>
                  )}
                  {table.mergedFromNumbers && table.mergedFromNumbers.length > 0 && (
                    <span className="badge" style={{ background: 'rgba(201,168,76,0.2)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.3)', fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Merge size={10} /> Merged: +T{table.mergedFromNumbers.join(', T')}
                    </span>
                  )}
                </div>
                {!mergeMode && !transferMode && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    {table.status !== 'FREE' && (
                      <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', fontSize: '11px' }} onClick={() => updateStatus(table.id, 'WAITING_PAYMENT')}>
                        Pay
                      </button>
                    )}
                    {isMerged && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                        onClick={() => unmergeTable(table.id)}
                        title="Unmerge table"
                      >
                        <Unlink size={11} /> Unmerge
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--danger-light)' }} onClick={() => deleteTable(table.id, table.number)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Table Modal */}
      {showAdd && (
        <Portal><div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add New Table</h3>
            <label className="input-label">Table Number</label>
            <input className="input" placeholder="e.g. 1, 2, VIP1" value={newNumber} onChange={e => setNewNumber(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTable()} autoFocus />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={addTable}>Add Table</button>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  )
}
