'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Plus, RefreshCw, Merge, ArrowRightLeft, Trash2, Unlink, ShieldCheck } from 'lucide-react'
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
  mergeGroupId?: string | null
  mergeGroupLabel?: string | null
  memberNumbers?: string[]
  displayLabel?: string
  credential?: string | null
}

interface FloorItem {
  id: string              // Primary / Host table ID
  primaryNumber: string   // e.g. "1"
  displayNumber: string   // e.g. "T1 + T2" or "1"
  status: 'FREE' | 'OCCUPIED' | 'WAITING_PAYMENT'
  isMerged: boolean
  credential: string | null // e.g. "MG-12-8F2A"
  memberNumbers: string[] // e.g. ["1", "2"]
  memberIds: string[]     // all table IDs in this unit
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
  const [unmergingId, setUnmergingId] = useState<string | null>(null)

  const load = useCallback(async (isBackground = false) => {
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

  useEffect(() => {
    const handleCloudPull = () => load(true)
    const handleSyncComplete = () => load(true)
    window.addEventListener('cloud-pull-complete', handleCloudPull)
    window.addEventListener('sync-complete', handleSyncComplete)

    const interval = setInterval(() => load(true), 30_000)

    return () => {
      window.removeEventListener('cloud-pull-complete', handleCloudPull)
      window.removeEventListener('sync-complete', handleSyncComplete)
      clearInterval(interval)
    }
  }, [load])

  // Group tables: merged tables are combined into a SINGLE unified FloorItem
  const floorItems = useMemo<FloorItem[]>(() => {
    const items: FloorItem[] = []
    const processedIds = new Set<string>()

    for (const table of tables) {
      if (processedIds.has(table.id)) continue

      const isMerged = Boolean(
        table.isMerged ||
        table.mergedWithId ||
        (table.mergedFromNumbers && table.mergedFromNumbers.length > 0) ||
        table.mergeGroupId
      )

      if (isMerged) {
        let groupMembers: Table[] = []

        if (table.mergeGroupId) {
          groupMembers = tables.filter(t => t.mergeGroupId === table.mergeGroupId)
        } else {
          const hostId = table.mergedWithId || table.id
          groupMembers = tables.filter(t => t.id === hostId || t.mergedWithId === hostId)
        }

        if (groupMembers.length === 0) groupMembers = [table]
        groupMembers.forEach(m => processedIds.add(m.id))

        // Host table is the one with no mergedWithId, or first
        const host = groupMembers.find(m => !m.mergedWithId) || groupMembers[0]

        const memberNumbers = groupMembers
          .map(m => m.number)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

        let groupStatus: 'FREE' | 'OCCUPIED' | 'WAITING_PAYMENT' = 'FREE'
        if (groupMembers.some(m => m.status === 'WAITING_PAYMENT')) groupStatus = 'WAITING_PAYMENT'
        else if (groupMembers.some(m => m.status === 'OCCUPIED')) groupStatus = 'OCCUPIED'

        const credential = host.credential || host.mergeGroupId || table.mergeGroupId || `MG-${memberNumbers.join('')}`
        const displayLabel = host.mergeGroupLabel || table.mergeGroupLabel || memberNumbers.map(n => `T${n}`).join('+')

        items.push({
          id: host.id,
          primaryNumber: host.number,
          displayNumber: displayLabel,
          status: groupStatus,
          isMerged: true,
          credential,
          memberNumbers,
          memberIds: groupMembers.map(m => m.id),
        })
      } else {
        processedIds.add(table.id)
        items.push({
          id: table.id,
          primaryNumber: table.number,
          displayNumber: table.number,
          status: table.status,
          isMerged: false,
          credential: null,
          memberNumbers: [table.number],
          memberIds: [table.id],
        })
      }
    }

    // Sort items naturally
    items.sort((a, b) => a.primaryNumber.localeCompare(b.primaryNumber, undefined, { numeric: true, sensitivity: 'base' }))
    return items
  }, [tables])

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
        setTables(prevTables)
        toast.error('Failed to update table status')
      }
    } catch {
      setTables(prevTables)
      toast.error('Network error updating table status')
    }
  }

  async function deleteTable(id: string, number: string) {
    if (!confirm(`Delete Table ${number}? Any past order history will be safely preserved.`)) return
    const prevTables = [...tables]
    setTables(prev => prev.filter(t => t.id !== id))

    try {
      const res = await fetch(`/api/tables/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTables(prevTables)
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
        toast.success(data.message || 'Tables combined successfully!')
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

  async function unmergeTable(tableId: string, memberNumbers?: string[]) {
    const confirmMsg = memberNumbers && memberNumbers.length > 1
      ? `Dismerge / Unmerge ${memberNumbers.map(n => 'Table ' + n).join(' & ')}?\n\n• Active order will stay safely on Table ${memberNumbers[0]}.\n• Table ${memberNumbers.slice(1).join(', ')} will be freed immediately.`
      : 'Unmerge tables?'

    if (!confirm(confirmMsg)) return

    setUnmergingId(tableId)
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
    } finally {
      setUnmergingId(null)
    }
  }

  function handleTransferClick(id: string) {
    setTransferSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev)
  }

  async function confirmTransfer() {
    if (transferSelected.length !== 2) return
    const [fromId, toId] = transferSelected
    try {
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
            {floorItems.length} units ({tables.length} physical tables) · {floorItems.filter(t => t.status === 'FREE').length} free · {floorItems.filter(t => t.status === 'OCCUPIED').length} occupied
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => load(false)}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
          <button className={`btn btn-sm ${mergeMode ? 'btn-gold' : 'btn-outline'}`} onClick={() => { setMergeMode(!mergeMode); setMergeSelected([]); setTransferMode(false) }}><Merge size={15} /> Merge Tables</button>
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
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 6px rgba(201,168,76,0.6)' }} />
          <span style={{ fontSize: '13px', color: 'var(--gold)', fontWeight: '600' }}>Combined Merged Unit</span>
        </div>
      </div>

      {/* Merge/Transfer instruction */}
      {(mergeMode || transferMode) && (
        <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '10px', padding: '14px 18px', marginBottom: '22px', fontSize: '14px', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span>
            {mergeMode
              ? mergeSelected.length === 0
                ? 'Select first table to merge (0/2 selected)'
                : mergeSelected.length === 1
                ? `Table ${floorItems.find(t => t.id === mergeSelected[0])?.displayNumber} selected. Select second table to combine (1/2 selected)`
                : `Ready to combine ${floorItems.find(t => t.id === mergeSelected[0])?.displayNumber} & ${floorItems.find(t => t.id === mergeSelected[1])?.displayNumber} into ONE merged unit (2/2 selected)`
              : `Select source then destination table (${transferSelected.length}/2 selected)`}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {mergeMode && mergeSelected.length === 2 && (
              <button className="btn btn-gold btn-sm" onClick={confirmMerge}>
                Combine into One Unit ({floorItems.find(t => t.id === mergeSelected[0])?.displayNumber} + {floorItems.find(t => t.id === mergeSelected[1])?.displayNumber})
              </button>
            )}
            {transferMode && transferSelected.length === 2 && <button className="btn btn-gold btn-sm" onClick={confirmTransfer}>Confirm Transfer</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => { setMergeMode(false); setTransferMode(false); setMergeSelected([]); setTransferSelected([]) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Floor Grid */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', color: 'var(--text-muted)' }}>Loading tables...</div>
      ) : floorItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🪑</div>
          <p>No tables yet. Add your first table!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
          {floorItems.map(item => {
            const colors = STATUS_COLORS[item.status]
            const isMergeSelected = mergeSelected.includes(item.id)
            const isTransferSelected = transferSelected.includes(item.id)
            const isSelected = isMergeSelected || isTransferSelected

            const mergedBg = item.status === 'FREE'
              ? 'linear-gradient(145deg, #FFFFFF 0%, #FEFCE8 60%, #FEF9C3 100%)'
              : item.status === 'OCCUPIED'
              ? 'linear-gradient(145deg, #FFFFFF 0%, #FFF7ED 60%, #FFEDD5 100%)'
              : 'linear-gradient(145deg, #FFFFFF 0%, #FEF2F2 60%, #FEE2E2 100%)'

            return (
              <div
                key={item.id}
                className="card-hover"
                onClick={() => {
                  if (mergeMode) handleMergeClick(item.id)
                  else if (transferMode) handleTransferClick(item.id)
                  else if (item.status === 'WAITING_PAYMENT') window.location.href = `/dashboard/payment`
                  else window.location.href = `/dashboard/orders/new?tableId=${item.id}`
                }}
                style={{
                  background: isSelected
                    ? 'rgba(201,168,76,0.18)'
                    : item.isMerged
                    ? mergedBg
                    : colors.bg,
                  border: isSelected
                    ? '2px solid var(--gold)'
                    : item.isMerged
                    ? '2px solid #D97706'
                    : `2px solid ${colors.border}`,
                  borderRadius: '14px',
                  padding: item.isMerged ? '14px 12px 12px' : '16px 12px',
                  textAlign: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: item.isMerged ? '0 4px 16px -2px rgba(217, 119, 6, 0.22), 0 2px 6px -1px rgba(0,0,0,0.05)' : undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: item.isMerged ? '180px' : '150px',
                }}
              >
                {/* Top Badge: Selection check or Merged Unit Header */}
                {isSelected && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--gold)', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--black)', fontWeight: '700', zIndex: 2 }}>✓</div>
                )}

                <div>
                  {item.isMerged ? (
                    <div style={{ marginBottom: '6px' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: '#FEF3C7',
                        color: '#92400E',
                        padding: '3px 8px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: '800',
                        letterSpacing: '0.5px',
                        border: '1px solid #FCD34D',
                        marginBottom: '4px'
                      }}>
                        <Merge size={11} /> COMBINED UNIT
                      </div>
                      {item.credential && (
                        <div style={{
                          fontFamily: 'monospace',
                          fontSize: '10px',
                          color: '#64748B',
                          letterSpacing: '0.8px',
                          fontWeight: '600'
                        }}>
                          ID: <span style={{ color: '#B45309', fontWeight: '800' }}>{item.credential}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '1px', fontWeight: '600' }}>TABLE</div>
                  )}

                  {/* Main Table Display */}
                  <div style={{
                    fontSize: item.isMerged ? '22px' : '28px',
                    fontWeight: '800',
                    fontFamily: 'Cinzel, serif',
                    color: '#0F172A',
                    marginBottom: '6px',
                    lineHeight: '1.2',
                    wordBreak: 'break-word',
                  }}>
                    {item.isMerged ? item.displayNumber : item.primaryNumber}
                  </div>

                  {item.isMerged && (
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '500', marginBottom: '8px' }}>
                      Includes: {item.memberNumbers.map(n => `T${n}`).join(', ')}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                    <span className={`badge ${colors.badge}`} style={{ fontSize: '10px', padding: '3px 10px', fontWeight: '600' }}>{colors.label}</span>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                {!mergeMode && !transferMode && (
                  <div style={{
                    marginTop: 'auto', display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap',
                    paddingTop: '6px',
                    borderTop: item.isMerged ? '1px solid #FDE68A' : '1px solid #F1F5F9'
                  }} onClick={e => e.stopPropagation()}>
                    {item.status !== 'FREE' && (
                      <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => updateStatus(item.id, 'WAITING_PAYMENT')}>
                        Pay
                      </button>
                    )}

                    {item.isMerged ? (
                      <button
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: '700',
                          background: '#FEF3C7',
                          border: '1px solid #F59E0B',
                          color: '#92400E',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => unmergeTable(item.id, item.memberNumbers)}
                        disabled={unmergingId === item.id}
                        title="Dismerge / Unmerge these tables"
                      >
                        <Unlink size={11} /> {unmergingId === item.id ? 'Unmerging...' : 'Unmerge'}
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{ padding: '3px 6px', fontSize: '11px', color: 'var(--danger-light)' }} onClick={() => deleteTable(item.id, item.primaryNumber)}>
                        <Trash2 size={11} />
                      </button>
                    )}
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
