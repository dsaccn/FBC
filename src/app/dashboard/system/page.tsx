'use client'

import React, { useState, useEffect, useTransition } from 'react'
import {
  Terminal, Database, RefreshCw, AlertTriangle, Shield, ShieldAlert,
  Search, Plus, Trash2, Edit3, ArrowRight, Download, CheckCircle2,
  XCircle, Clock, Cpu, HardDrive, Eye, Copy, Play, Layers,
  ExternalLink, FileText, ChevronRight, Lock, Unlock, Filter
} from 'lucide-react'

interface ModelMeta {
  id: string
  name: string
  category: string
  primaryKey: string
  description: string
}

export default function DeveloperSystemPortal() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'sync' | 'integrity' | 'sql' | 'health' | 'audit'>('explorer')
  const [writeMode, setWriteMode] = useState(false)
  const [models, setModels] = useState<ModelMeta[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('User')
  
  // Table Data State
  const [records, setRecords] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [page, setPage] = useState<number>(1)
  const [search, setSearch] = useState<string>('')
  const [loadingRecords, setLoadingRecords] = useState<boolean>(false)
  
  // Row Inspector & Edit Modal
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null)
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [editFormData, setEditFormData] = useState<Record<string, any>>({})
  const [editReason, setEditReason] = useState<string>('')
  const [actionError, setActionError] = useState<string>('')
  const [actionSuccess, setActionSuccess] = useState<string>('')

  // Sync Flight Control State
  const [syncData, setSyncData] = useState<any | null>(null)
  const [syncing, setSyncing] = useState<boolean>(false)

  // Health & WAL State
  const [healthData, setHealthData] = useState<any | null>(null)
  const [checkpointing, setCheckpointing] = useState<boolean>(false)

  // Integrity State
  const [integrityData, setIntegrityData] = useState<any | null>(null)
  const [scanningIntegrity, setScanningIntegrity] = useState<boolean>(false)

  // SQL State
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM "User" LIMIT 10')
  const [sqlResult, setSqlResult] = useState<any | null>(null)
  const [runningSql, setRunningSql] = useState<boolean>(false)

  // Dev Audit State
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditTotal, setAuditTotal] = useState<number>(0)

  // Load Models & Stats on Mount
  useEffect(() => {
    fetch('/api/system/models')
      .then(res => res.json())
      .then(data => {
        if (data.models) setModels(data.models)
      })
      .catch(console.error)

    refreshHealth()
    refreshSync()
  }, [])

  // Keyboard Escape listener to dismiss modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditing(false)
        setIsCreating(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Load records whenever model, page, or search changes
  useEffect(() => {
    if (activeTab === 'explorer') {
      loadRecords()
    }
  }, [selectedModel, page, activeTab])

  // Load specific tab data when switched
  useEffect(() => {
    if (activeTab === 'sync') refreshSync()
    if (activeTab === 'health') refreshHealth()
    if (activeTab === 'integrity') runIntegrityScan()
    if (activeTab === 'audit') loadAuditLogs()
  }, [activeTab])

  async function loadRecords() {
    setLoadingRecords(true)
    setActionError('')
    try {
      const q = new URLSearchParams({
        model: selectedModel,
        page: String(page),
        limit: '25',
        search: search.trim(),
      })
      const res = await fetch(`/api/system/records?${q.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setRecords(data.records || [])
        setTotalCount(data.totalCount || 0)
      } else {
        setActionError(data.error || 'Failed to fetch records')
      }
    } catch (e: any) {
      setActionError(e.message || 'Network error')
    } finally {
      setLoadingRecords(false)
    }
  }

  async function refreshSync() {
    try {
      const res = await fetch('/api/system/sync')
      const data = await res.json()
      if (res.ok) setSyncData(data)
    } catch (e) {
      console.error(e)
    }
  }

  async function triggerManualSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/system/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setActionSuccess('Sync cycle successfully triggered!')
        setTimeout(() => setActionSuccess(''), 4000)
        refreshSync()
      } else {
        setActionError(data.error || 'Sync trigger failed')
      }
    } finally {
      setSyncing(false)
    }
  }

  async function refreshHealth() {
    try {
      const res = await fetch('/api/system/health')
      const data = await res.json()
      if (res.ok) setHealthData(data)
    } catch (e) {
      console.error(e)
    }
  }

  async function triggerWalCheckpoint() {
    setCheckpointing(true)
    try {
      const res = await fetch('/api/system/health', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setActionSuccess('SQLite WAL Checkpoint (TRUNCATE) completed!')
        setTimeout(() => setActionSuccess(''), 4000)
        refreshHealth()
      } else {
        setActionError(data.error || 'WAL Checkpoint failed')
      }
    } finally {
      setCheckpointing(false)
    }
  }

  async function runIntegrityScan() {
    setScanningIntegrity(true)
    try {
      const res = await fetch('/api/system/integrity')
      const data = await res.json()
      if (res.ok) setIntegrityData(data)
    } finally {
      setScanningIntegrity(false)
    }
  }

  async function runQuery() {
    setRunningSql(true)
    setSqlResult(null)
    setActionError('')
    try {
      const res = await fetch('/api/system/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery, allowWrite: writeMode }),
      })
      const data = await res.json()
      if (res.ok) {
        setSqlResult(data)
      } else {
        setActionError(data.error || 'Query failed')
      }
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setRunningSql(false)
    }
  }

  async function loadAuditLogs() {
    try {
      const res = await fetch('/api/system/audit?limit=50')
      const data = await res.json()
      if (res.ok) {
        setAuditLogs(data.logs || [])
        setAuditTotal(data.totalCount || 0)
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function handleSaveRecord() {
    if (!writeMode) {
      setActionError('Write mode is disabled. Toggle Write Mode to commit changes.')
      return
    }
    try {
      const res = await fetch('/api/system/records', {
        method: isCreating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          id: selectedRecord?.id,
          data: editFormData,
          reason: editReason || 'Direct edit from Developer Portal',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setActionSuccess(isCreating ? 'Record created successfully!' : 'Record updated successfully!')
        setTimeout(() => setActionSuccess(''), 4000)
        setIsEditing(false)
        setIsCreating(false)
        setSelectedRecord(null)
        loadRecords()
      } else {
        setActionError(data.error || 'Save failed')
      }
    } catch (e: any) {
      setActionError(e.message)
    }
  }

  async function handleDeleteRecord(id: string) {
    if (!writeMode) {
      setActionError('Write mode is disabled. Toggle Write Mode to delete records.')
      return
    }
    const reason = prompt('Please enter a reason for deleting this record:')
    if (!reason) return

    try {
      const q = new URLSearchParams({ model: selectedModel, id, reason })
      const res = await fetch(`/api/system/records?${q.toString()}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setActionSuccess(`Record ${id} deleted!`)
        setTimeout(() => setActionSuccess(''), 4000)
        setSelectedRecord(null)
        loadRecords()
      } else {
        setActionError(data.error || 'Delete failed')
      }
    } catch (e: any) {
      setActionError(e.message)
    }
  }

  // Map foreign keys to their target Prisma models
  const RELATION_MODEL_MAP: Record<string, string> = {
    userId: 'User',
    tableId: 'Table',
    orderId: 'Order',
    menuItemId: 'MenuItem',
    categoryId: 'Category',
    ingredientId: 'Ingredient',
    parentItemId: 'MenuItem',
    cashierId: 'User',
    waiterId: 'User',
    staffMemberId: 'StaffMember',
    staffMenuItemId: 'StaffMenuItem',
    staffIngredientId: 'StaffIngredient',
  }

  function jumpToRelation(targetModel: string, targetId: string) {
    setSelectedModel(targetModel)
    setSearch(targetId)
    setPage(1)
    setActiveTab('explorer')
  }

  function openEditModal(record: any) {
    setSelectedRecord(record)
    setEditFormData({ ...record })
    setEditReason('')
    setIsEditing(true)
    setIsCreating(false)
  }

  function openCreateModal() {
    setSelectedRecord(null)
    const initialFields: Record<string, any> = {}
    recordColumns.filter(c => c !== 'id' && c !== 'createdAt' && c !== 'updatedAt').forEach(col => {
      initialFields[col] = ''
    })
    setEditFormData(initialFields)
    setEditReason('')
    setIsCreating(true)
    setIsEditing(false)
  }

  // Get field keys of current records
  const recordColumns = records.length > 0 ? Object.keys(records[0]) : []

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Flight Control Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B48A1E' }}>
              <Terminal size={18} />
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
              Developer & System Management Portal
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
            Unified dual-database flight control, 18-table CRUD, sync engine monitor, and integrity auditor.
          </p>
        </div>

        {/* Action Controls & Write Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Neon Cloud Status Badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px',
            fontSize: '12px', fontWeight: '500',
            background: syncData?.cloud?.status === 'CONNECTED' ? 'rgba(5, 150, 105, 0.08)' : 'rgba(220, 38, 38, 0.08)',
            border: `1px solid ${syncData?.cloud?.status === 'CONNECTED' ? 'rgba(5, 150, 105, 0.25)' : 'rgba(220, 38, 38, 0.25)'}`,
            color: syncData?.cloud?.status === 'CONNECTED' ? '#059669' : '#DC2626'
          }}>
            <Database size={13} />
            <span>Neon: {syncData?.cloud?.status === 'CONNECTED' ? `${syncData?.cloud?.latencyMs}ms` : 'Offline'}</span>
          </div>

          {/* SQLite Disk Size Badge */}
          {healthData && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px',
              fontSize: '12px', fontWeight: '500', background: 'var(--black-card)', border: '1px solid var(--black-border)',
              color: 'var(--text-secondary)'
            }}>
              <HardDrive size={13} />
              <span>SQLite: {healthData.database.totalDiskUsage}</span>
            </div>
          )}

          {/* Master Write Mode Toggle */}
          <button
            onClick={() => setWriteMode(!writeMode)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s ease',
              background: writeMode ? '#DC2626' : '#F1F5F9',
              color: writeMode ? '#FFFFFF' : '#475569',
              border: `1px solid ${writeMode ? '#B91C1C' : '#CBD5E1'}`,
              boxShadow: writeMode ? '0 0 12px rgba(220, 38, 38, 0.35)' : 'none'
            }}
          >
            {writeMode ? <Unlock size={14} /> : <Lock size={14} />}
            <span>{writeMode ? 'WRITE MODE ACTIVE' : 'READ-ONLY MODE'}</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {actionError && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', color: '#DC2626', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(5, 150, 105, 0.1)', border: '1px solid rgba(5, 150, 105, 0.3)', color: '#059669', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--black-border)', paddingBottom: '12px', marginBottom: '20px', overflowX: 'auto' }}>
        {[
          { id: 'explorer', label: '1. Table Browser & CRUD', icon: <Layers size={15} /> },
          { id: 'sync', label: `2. Sync Engine (${syncData?.totalPending ?? 0} Pending)`, icon: <RefreshCw size={15} /> },
          { id: 'integrity', label: '3. Financial Integrity Scanner', icon: <ShieldAlert size={15} /> },
          { id: 'sql', label: '4. SQL & Query Console', icon: <Terminal size={15} /> },
          { id: 'health', label: '5. System Health & Maintenance', icon: <Cpu size={15} /> },
          { id: 'audit', label: `6. Dev Audit Trail (${auditTotal})`, icon: <Clock size={15} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '6px',
              fontSize: '13px', fontWeight: activeTab === tab.id ? '600' : '500', cursor: 'pointer',
              background: activeTab === tab.id ? 'var(--text-primary)' : 'transparent',
              color: activeTab === tab.id ? '#FFFFFF' : 'var(--text-secondary)',
              border: 'none', transition: 'all 0.15s ease'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: 18-TABLE BROWSER & CRUD */}
      {activeTab === 'explorer' && (
        <div>
          {/* Controls Bar: Model Selector, Search, Insert */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '300px' }}>
              <select
                value={selectedModel}
                onChange={(e) => { setSelectedModel(e.target.value); setPage(1); }}
                style={{
                  padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--black-border)',
                  background: 'var(--black-card)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600',
                  outline: 'none', minWidth: '220px'
                }}
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.category})
                  </option>
                ))}
              </select>

              {/* Search Bar */}
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder={`Search ${selectedModel} records...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadRecords()}
                  style={{
                    width: '100%', padding: '9px 12px 9px 36px', borderRadius: '8px',
                    border: '1px solid var(--black-border)', background: 'var(--black-card)',
                    color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
                  }}
                />
              </div>

              <button
                onClick={loadRecords}
                className="btn btn-ghost"
                style={{ padding: '9px 14px', fontSize: '13px' }}
              >
                Search
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={openCreateModal}
                disabled={!writeMode}
                className="btn btn-primary"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 16px',
                  opacity: writeMode ? 1 : 0.5, cursor: writeMode ? 'pointer' : 'not-allowed'
                }}
              >
                <Plus size={15} />
                <span>Insert Record</span>
              </button>

              <a
                href={`/api/system/records?model=${selectedModel}&limit=250`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 14px' }}
              >
                <Download size={14} />
                <span>Export JSON</span>
              </a>
            </div>
          </div>

          {/* High-Density Data Grid */}
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '650px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--black-border)', color: '#475569', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '10px 14px', width: '90px' }}>Actions</th>
                    {recordColumns.map(col => (
                      <th key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingRecords ? (
                    <tr>
                      <td colSpan={recordColumns.length + 1} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                        Loading {selectedModel} records...
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={recordColumns.length + 1} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                        No records found for {selectedModel}.
                      </td>
                    </tr>
                  ) : (
                    records.map((row, idx) => (
                      <tr
                        key={row.id || idx}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          transition: 'background 0.15s ease',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <button
                              onClick={() => openEditModal(row)}
                              title="Inspect & Edit"
                              style={{ padding: '4px 7px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', color: '#0F172A' }}
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(row.id)}
                              disabled={!writeMode}
                              title="Delete Record"
                              style={{ padding: '4px 7px', borderRadius: '4px', border: '1px solid #FECACA', background: '#FEF2F2', cursor: writeMode ? 'pointer' : 'not-allowed', color: '#DC2626', opacity: writeMode ? 1 : 0.4 }}
                            >
                              <Trash2 size={13} />
                            </button>
                            {selectedModel === 'Order' && row.id && (
                              <>
                                <button
                                  onClick={() => jumpToRelation('OrderItem', row.id)}
                                  title="Jump to Order Items"
                                  style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #BFDBFE', background: '#EFF6FF', cursor: 'pointer', color: '#1D4ED8', fontSize: '11px', fontWeight: '600' }}
                                >
                                  Items
                                </button>
                                <button
                                  onClick={() => jumpToRelation('Payment', row.id)}
                                  title="Jump to Payments"
                                  style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #BBF7D0', background: '#F0FDF4', cursor: 'pointer', color: '#15803D', fontSize: '11px', fontWeight: '600' }}
                                >
                                  Pay
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        {recordColumns.map(col => {
                          const val = row[col]
                          let displayVal = String(val ?? '—')
                          if (typeof val === 'boolean') {
                            displayVal = val ? 'true' : 'false'
                          } else if (typeof val === 'object' && val !== null) {
                            displayVal = JSON.stringify(val)
                          }
                          const isRelation = RELATION_MODEL_MAP[col] && val
                          const isIdCol = col === 'id' || col.endsWith('Id')

                          return (
                            <td
                              key={col}
                              style={{
                                padding: '8px 14px',
                                maxWidth: '280px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: col === 'id' ? '#64748B' : 'var(--text-primary)',
                                fontFamily: isIdCol ? 'monospace' : 'inherit'
                              }}
                              title={String(displayVal)}
                            >
                              {typeof val === 'boolean' ? (
                                <span style={{
                                  display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                                  background: val ? 'rgba(5, 150, 105, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                                  color: val ? '#059669' : '#64748B'
                                }}>
                                  {displayVal}
                                </span>
                              ) : isRelation ? (
                                <button
                                  onClick={() => jumpToRelation(RELATION_MODEL_MAP[col], String(val))}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '2px 7px', borderRadius: '4px', fontSize: '11px',
                                    background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8',
                                    cursor: 'pointer', fontFamily: 'monospace'
                                  }}
                                  title={`Jump to ${RELATION_MODEL_MAP[col]} with ID ${val}`}
                                >
                                  <span>{displayVal.length > 14 ? `${displayVal.slice(0, 10)}...` : displayVal}</span>
                                  <ArrowRight size={10} />
                                </button>
                              ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{displayVal}</span>
                                  {isIdCol && val && (
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(String(val))
                                        setActionSuccess(`Copied ${col} to clipboard`)
                                        setTimeout(() => setActionSuccess(''), 2000)
                                      }}
                                      style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '1px' }}
                                      title="Copy ID to clipboard"
                                    >
                                      <Copy size={11} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--black-border)', fontSize: '13px', color: '#64748B' }}>
              <div>
                Total: <strong>{totalCount}</strong> records · Page <strong>{page}</strong> of <strong>{Math.ceil(totalCount / 25) || 1}</strong>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="btn btn-ghost"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  Previous
                </button>
                <button
                  disabled={page * 25 >= totalCount}
                  onClick={() => setPage(p => p + 1)}
                  className="btn btn-ghost"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SYNC FLIGHT CONTROL */}
      {activeTab === 'sync' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Local DB card */}
            <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <HardDrive size={18} style={{ color: '#059669' }} />
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0 }}>
                  Local SQLite ({healthData?.database?.mainFile?.fileName || 'kogna.db'})
                </h3>
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.8' }}>
                <div>Status: <span style={{ color: '#059669', fontWeight: '600' }}>ONLINE & ACTIVE</span></div>
                <div>Disk Usage: <strong>{healthData?.database?.totalDiskUsage || 'Calculating...'}</strong></div>
                <div>Journal Mode: <strong>{healthData?.database?.journalMode || 'WAL'}</strong></div>
                <div>Engine: SQLite 3 Client via Prisma</div>
              </div>
            </div>

            {/* Cloud Neon Card */}
            <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Database size={18} style={{ color: syncData?.cloud?.status === 'CONNECTED' ? '#059669' : '#DC2626' }} />
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0 }}>AWS Neon PostgreSQL Cloud</h3>
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.8' }}>
                <div>Connection: <strong style={{ color: syncData?.cloud?.status === 'CONNECTED' ? '#059669' : '#DC2626' }}>{syncData?.cloud?.status || 'Testing...'}</strong></div>
                <div>Latency Ping: <strong>{syncData?.cloud?.latencyMs ? `${syncData?.cloud?.latencyMs} ms` : 'N/A'}</strong></div>
                <div>Provider: AWS Neon Serverless Pooler (us-east-2)</div>
                <div>Protocol: SSL/TLS Require</div>
              </div>
            </div>
          </div>

          {/* Pending Queue Breakdown */}
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Pending Synchronization Queue</h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Total of <strong>{syncData?.totalPending ?? 0}</strong> local records waiting to push to the cloud.
                </p>
              </div>
              <button
                onClick={triggerManualSync}
                disabled={syncing}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px' }}
              >
                <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                <span>{syncing ? 'Synchronizing...' : 'Force Full Sync Now'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {syncData?.breakdown && Object.entries(syncData.breakdown).map(([key, count]: any) => (
                <div key={key} style={{ padding: '14px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', textTransform: 'capitalize' }}>{key}</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: count > 0 ? '#D97706' : '#059669', marginTop: '4px' }}>
                    {count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FINANCIAL INTEGRITY SCANNER */}
      {activeTab === 'integrity' && (
        <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Financial & Business Logic Integrity Scanner</h3>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                Detects orphaned orders, table discrepancies, negative stock, and anomalous discounts.
              </p>
            </div>
            <button
              onClick={runIntegrityScan}
              disabled={scanningIntegrity}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', fontSize: '13px' }}
            >
              <ShieldAlert size={15} />
              <span>{scanningIntegrity ? 'Auditing Database...' : 'Run Integrity Scan'}</span>
            </button>
          </div>

          {integrityData && (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '18px' }}>
                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: 'rgba(220, 38, 38, 0.1)', color: '#DC2626' }}>
                  High: {integrityData.highSeverityCount}
                </span>
                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: 'rgba(217, 119, 6, 0.1)', color: '#D97706' }}>
                  Medium: {integrityData.mediumSeverityCount}
                </span>
                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: 'rgba(59, 130, 246, 0.1)', color: '#2563EB' }}>
                  Info: {integrityData.infoCount}
                </span>
              </div>

              {integrityData.issues.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#059669', background: '#F0FDF4', borderRadius: '8px' }}>
                  <CheckCircle2 size={32} style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontSize: '15px', fontWeight: '600' }}>All integrity checks passed!</div>
                  <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>No orphan records, negative inventory, or table status conflicts found.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {integrityData.issues.map((issue: any, idx: number) => (
                    <div key={idx} style={{
                      padding: '14px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700',
                            background: issue.severity === 'HIGH' ? '#FEE2E2' : issue.severity === 'MEDIUM' ? '#FEF3C7' : '#EFF6FF',
                            color: issue.severity === 'HIGH' ? '#DC2626' : issue.severity === 'MEDIUM' ? '#D97706' : '#2563EB'
                          }}>
                            {issue.severity}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{issue.title}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{issue.description}</div>
                      </div>
                      <button
                        onClick={() => { setSelectedModel(issue.table); setActiveTab('explorer'); }}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Inspect {issue.table}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SQL & QUERY CONSOLE */}
      {activeTab === 'sql' && (
        <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Guarded SQL Query Console</h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
              Execute custom queries directly on the SQLite database. Mutations require Write Mode.
            </p>
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {[
              { label: 'Top 10 Users', q: 'SELECT * FROM "User" LIMIT 10' },
              { label: 'Count Open Orders', q: 'SELECT count(*) as open_orders FROM "Order" WHERE status = \'OPEN\'' },
              { label: 'Low Stock Menu Items', q: 'SELECT name, "stockQuantity", "lowStockThreshold" FROM "MenuItem" WHERE "stockQuantity" <= "lowStockThreshold"' },
              { label: 'Recent Payments', q: 'SELECT amount, method, "createdAt" FROM "Payment" ORDER BY "createdAt" DESC LIMIT 10' },
              { label: 'Database Journal Mode', q: 'PRAGMA journal_mode' },
            ].map((preset, idx) => (
              <button
                key={idx}
                onClick={() => setSqlQuery(preset.q)}
                style={{ padding: '4px 10px', borderRadius: '6px', background: '#F1F5F9', border: '1px solid #CBD5E1', fontSize: '11px', fontWeight: '500', cursor: 'pointer' }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            rows={4}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--black-border)',
              background: '#0F172A', color: '#F8FAFC', fontFamily: 'monospace', fontSize: '13px', outline: 'none',
              boxSizing: 'border-box', marginBottom: '12px'
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={runQuery}
                disabled={runningSql}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontSize: '13px' }}
              >
                <Play size={14} />
                <span>{runningSql ? 'Executing...' : 'Run Query'}</span>
              </button>
              {sqlResult && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(sqlResult.results, null, 2))
                    setActionSuccess('Query results copied to clipboard as JSON!')
                    setTimeout(() => setActionSuccess(''), 2500)
                  }}
                  className="btn btn-ghost"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px' }}
                >
                  <Copy size={13} />
                  <span>Copy JSON</span>
                </button>
              )}
            </div>
            {sqlResult && (
              <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600' }}>
                Executed in {sqlResult.durationMs}ms · {sqlResult.rowCount} rows returned
              </div>
            )}
          </div>

          {sqlResult && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', maxHeight: '400px', overflowY: 'auto' }}>
              <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace' }}>
                {JSON.stringify(sqlResult.results, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SYSTEM HEALTH & MAINTENANCE */}
      {activeTab === 'health' && healthData && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Database Files & WAL */}
            <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>SQLite Database Disk Allocation</h3>
              <div style={{ fontSize: '13px', color: '#64748B', lineHeight: '2' }}>
                <div>Main Database: <strong>{healthData.database.mainFile.formatted}</strong> ({healthData.database.mainFile.path})</div>
                <div>WAL Journal File: <strong>{healthData.database.walFile.formatted}</strong></div>
                <div>Shared Memory (SHM): <strong>{healthData.database.shmFile.formatted}</strong></div>
                <div>Total Allocation: <strong style={{ color: '#0F172A' }}>{healthData.database.totalDiskUsage}</strong></div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <button
                  onClick={triggerWalCheckpoint}
                  disabled={checkpointing}
                  className="btn btn-ghost"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 14px' }}
                >
                  <RefreshCw size={13} className={checkpointing ? 'animate-spin' : ''} />
                  <span>Run PRAGMA wal_checkpoint(TRUNCATE)</span>
                </button>
              </div>
            </div>

            {/* Server Process Metrics */}
            <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Server Runtime Environment</h3>
              <div style={{ fontSize: '13px', color: '#64748B', lineHeight: '2' }}>
                <div>Node.js Version: <strong>{healthData.system.nodeVersion}</strong> ({healthData.system.platform} {healthData.system.arch})</div>
                <div>Server Uptime: <strong>{healthData.system.uptimeFormatted}</strong></div>
                <div>Process Memory (RSS): <strong>{healthData.system.memoryRss}</strong></div>
                <div>Heap Used / Total: <strong>{healthData.system.heapUsed} / {healthData.system.heapTotal}</strong></div>
                <div>System RAM: <strong>{healthData.system.freeMem} free of {healthData.system.totalMem}</strong></div>
              </div>
            </div>
          </div>

          {/* Backup & Disaster Recovery */}
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Full System Snapshot & Disaster Recovery</h3>
            <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
              Export complete JSON archive of all 18 database tables.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <a
                href="/api/system/backup"
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px' }}
              >
                <Download size={15} />
                <span>Download Complete Backup (.json)</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DEVELOPER AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div style={{ background: 'var(--black-card)', border: '1px solid var(--black-border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Developer Self-Audit Trail (Zero Silent Edits)</h3>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                Every developer mutation, update, deletion, and raw SQL query is permanently audited.
              </p>
            </div>
            <button onClick={loadAuditLogs} className="btn btn-ghost" style={{ fontSize: '12px', padding: '6px 12px' }}>
              Refresh Feed
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {auditLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>No audit events logged yet.</div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} style={{ padding: '14px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                        background: log.action === 'DELETE' ? '#FEE2E2' : log.action === 'CREATE' ? '#D1FAE5' : '#FEF3C7',
                        color: log.action === 'DELETE' ? '#DC2626' : log.action === 'CREATE' ? '#059669' : '#D97706'
                      }}>
                        {log.action}
                      </span>
                      <strong style={{ fontSize: '13px' }}>{log.targetTable}</strong>
                      {log.recordId && <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>({log.recordId})</span>}
                    </div>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    Developer: <strong>{log.developerUsername}</strong> · Reason: <em>{log.reason}</em>
                  </div>
                  {log.previousState && log.newState && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
                      <div style={{ background: '#FFF1F2', padding: '8px', borderRadius: '4px', border: '1px solid #FECDD3', overflowX: 'auto' }}>
                        <div style={{ color: '#E11D48', fontWeight: '700', marginBottom: '2px' }}>Previous State</div>
                        <pre style={{ margin: 0 }}>{log.previousState}</pre>
                      </div>
                      <div style={{ background: '#F0FDF4', padding: '8px', borderRadius: '4px', border: '1px solid #BBF7D0', overflowX: 'auto' }}>
                        <div style={{ color: '#16A34A', fontWeight: '700', marginBottom: '2px' }}>New State</div>
                        <pre style={{ margin: 0 }}>{log.newState}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* RECORD INSPECT & EDIT MODAL */}
      {(isEditing || isCreating) && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setIsEditing(false); setIsCreating(false); } }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
          }}
        >
          <div style={{
            background: '#FFFFFF', borderRadius: '14px', maxWidth: '750px', width: '100%', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>
                  {isCreating ? `Insert New ${selectedModel} Record` : `Edit ${selectedModel} Record`}
                </h3>
                {selectedRecord?.id && (
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748B' }}>
                    ID: {selectedRecord.id}
                  </span>
                )}
              </div>
              <button
                onClick={() => { setIsEditing(false); setIsCreating(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {Object.keys(editFormData).filter(k => k !== 'id').map(key => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      {key}
                    </label>
                    <input
                      type="text"
                      value={typeof editFormData[key] === 'object' && editFormData[key] !== null ? JSON.stringify(editFormData[key]) : String(editFormData[key] ?? '')}
                      onChange={(e) => setEditFormData({ ...editFormData, [key]: e.target.value })}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1',
                        fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                  </div>
                ))}

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#DC2626', marginBottom: '4px' }}>
                    Audit Reason (Mandatory for Write Tracking)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Corrected stock quantity after physical count"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FECACA',
                      background: '#FEF2F2', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => { setIsEditing(false); setIsCreating(false); }}
                className="btn btn-ghost"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRecord}
                disabled={!writeMode}
                className="btn btn-primary"
                style={{ padding: '8px 18px', fontSize: '13px', opacity: writeMode ? 1 : 0.5 }}
              >
                {isCreating ? 'Insert into Database' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
