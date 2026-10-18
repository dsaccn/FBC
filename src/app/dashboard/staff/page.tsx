'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, UserX, UserCheck, Trash2 } from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import Portal from '@/components/Portal'

interface Staff { id: string; username: string; fullName: string; role: string; phone?: string; active: boolean }

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER']
const EMPTY = { username: '', fullName: '', password: '', role: 'WAITER', phone: '' }

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editStaff, setEditStaff] = useState<Staff | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null)
  const [deleteConfirming, setDeleteConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/staff')
      if (res.ok) {
        setStaff(await res.json())
      } else {
        setLoadError(`Failed to load staff (${res.status})`)
        toast.error('Failed to load staff members')
      }
    } catch {
      setLoadError('Unable to connect to server. Please check your connection.')
      toast.error('Network error loading staff')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() { setEditStaff(null); setForm(EMPTY); setDeleteConfirming(false); setShowForm(true) }
  function openEdit(s: Staff) { setEditStaff(s); setForm({ username: s.username, fullName: s.fullName, password: '', role: s.role, phone: s.phone || '' }); setDeleteConfirming(false); setShowForm(true) }

  async function save() {
    if (!form.fullName.trim() || !form.username.trim()) {
      toast.warning('Full name and username are required')
      return
    }
    if (!editStaff && !form.password.trim()) {
      toast.warning('Password is required for new staff accounts')
      return
    }

    setSaving(true)
    try {
      let res;
      if (editStaff) {
        res = await fetch(`/api/staff/${editStaff.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      } else {
        res = await fetch('/api/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to save staff member')
        setSaving(false)
        return
      }

      toast.success(editStaff ? 'Staff member details updated!' : 'Staff member created successfully!')
      setShowForm(false)
      load()
    } catch {
      toast.error('Network error saving staff')
    } finally {
      setSaving(false)
    }
  }

  async function executeDelete(s: Staff) {
    setActionLoadingId(s.id)
    // Optimistic removal
    const previousStaff = [...staff]
    setStaff(prev => prev.filter(x => x.id !== s.id))
    setShowForm(false)
    setStaffToDelete(null)
    setDeleteConfirming(false)

    try {
      const res = await fetch(`/api/staff/${s.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStaff(previousStaff)
        toast.error(data.error || 'Failed to delete staff member')
        return
      }
      toast.success(`"${s.fullName}" deleted permanently`)
      load()
    } catch {
      setStaff(previousStaff)
      toast.error('Network error deleting staff member')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function toggleActive(s: Staff) {
    const nextActive = !s.active
    setActionLoadingId(s.id)

    // Optimistic update
    setStaff(prev => prev.map(x => x.id === s.id ? { ...x, active: nextActive } : x))

    try {
      const res = await fetch(`/api/staff/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive })
      })
      if (res.ok) {
        toast.info(`Staff member ${nextActive ? 'activated' : 'deactivated'}`)
      } else {
        // Revert on error
        setStaff(prev => prev.map(x => x.id === s.id ? { ...x, active: s.active } : x))
        toast.error('Failed to change staff status')
      }
    } catch {
      setStaff(prev => prev.map(x => x.id === s.id ? { ...x, active: s.active } : x))
      toast.error('Network error updating staff status')
    } finally {
      setActionLoadingId(null)
    }
  }

  const roleColors: Record<string, string> = { ADMIN: 'var(--gold)', MANAGER: 'var(--warning-light)', CASHIER: 'var(--success-light)', WAITER: 'var(--text-secondary)' }

  const activeCount = staff.filter(s => s.active).length
  const inactiveCount = staff.filter(s => !s.active).length

  const filteredStaff = staff.filter(s => {
    if (filter === 'active') return s.active
    if (filter === 'inactive') return !s.active
    return true
  })

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}>
            <span className="gold-text">Staff Management</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                background: filter === 'all' ? 'var(--gold)' : 'transparent',
                color: filter === 'all' ? '#FFFFFF' : 'var(--text-secondary)',
                border: filter === 'all' ? 'none' : '1px solid var(--black-border)',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              All ({staff.length})
            </button>
            <button
              onClick={() => setFilter('active')}
              style={{
                background: filter === 'active' ? '#059669' : 'transparent',
                color: filter === 'active' ? '#FFFFFF' : 'var(--text-secondary)',
                border: filter === 'active' ? 'none' : '1px solid var(--black-border)',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setFilter('inactive')}
              style={{
                background: filter === 'inactive' ? '#DC2626' : 'transparent',
                color: filter === 'inactive' ? '#FFFFFF' : 'var(--text-secondary)',
                border: filter === 'inactive' ? 'none' : '1px solid var(--black-border)',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Inactive ({inactiveCount})
            </button>
          </div>
        </div>
        <button className="btn btn-gold btn-sm" onClick={openNew}>
          <Plus size={14} /> Add Staff
        </button>
      </div>

      {loadError && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{loadError}</span>
          <button className="btn btn-sm btn-ghost" style={{ color: 'inherit' }} onClick={load}>Retry</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {loading ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading...</div>
        ) : filteredStaff.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No {filter === 'all' ? '' : filter} staff members found.
          </div>
        ) : filteredStaff.map(s => (
          <div key={s.id} className="card" style={{ opacity: s.active ? 1 : 0.65, border: s.active ? '1px solid var(--black-border)' : '1px dashed #DC2626', transition: 'all 0.2s', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: s.active ? 'rgba(201,168,76,0.1)' : 'rgba(220,38,38,0.1)', border: `1px solid ${s.active ? 'var(--gold-dark)' : '#DC2626'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: s.active ? 'var(--gold)' : '#DC2626', flexShrink: 0 }}>
                  {s.fullName.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{s.fullName}</span>
                    {!s.active && (
                      <span style={{ fontSize: '9px', fontWeight: '800', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '1px 5px', borderRadius: '4px' }}>
                        DEACTIVATED
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>@{s.username}</div>
                </div>
              </div>
              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '10px', background: `${roleColors[s.role]}22`, color: roleColors[s.role], fontWeight: '700', border: `1px solid ${roleColors[s.role]}44`, whiteSpace: 'nowrap' }}>
                {s.role}
              </span>
            </div>
            {s.phone && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>📞 {s.phone}</div>}
            
            <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
              <button
                className="btn btn-outline btn-sm"
                style={{ flex: 1 }}
                onClick={() => openEdit(s)}
                disabled={actionLoadingId === s.id}
              >
                <Pencil size={13} /> Edit
              </button>
              
              <button
                className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-success'}`}
                style={{ flex: 1 }}
                onClick={() => toggleActive(s)}
                disabled={actionLoadingId === s.id}
                title={s.active ? 'Temporarily deactivate login' : 'Reactivate login'}
              >
                {s.active ? <><UserX size={13} /> Deactivate</> : <><UserCheck size={13} /> Activate</>}
              </button>

              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ borderColor: 'rgba(220,38,38,0.3)', color: '#DC2626', padding: '0 10px' }}
                onClick={() => setStaffToDelete(s)}
                disabled={actionLoadingId === s.id}
                title="Permanently Delete User"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Staff Form Modal */}
      {showForm && (
        <Portal><div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>{editStaff ? 'Edit Staff Member' : 'Add New Staff Member'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Full Name</label>
                <input className="input" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Abebe Bekele" autoFocus />
              </div>
              <div>
                <label className="input-label">Username</label>
                <input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. abebe123" />
              </div>
              <div>
                <label className="input-label">{editStaff ? 'New Password (leave blank to keep current)' : 'Password'}</label>
                <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
              </div>
              <div>
                <label className="input-label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+251..." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={save} disabled={saving}>{saving ? 'Saving...' : editStaff ? 'Save Changes' : 'Add Staff'}</button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
            {editStaff && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--black-border)' }}>
                {deleteConfirming ? (
                  <div style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '10px',
                    padding: '12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ color: '#991B1B', fontWeight: '700', fontSize: '13px', marginBottom: '4px' }}>
                      Permanently delete {editStaff.fullName}?
                    </div>
                    <div style={{ color: '#B91C1C', fontSize: '12px', marginBottom: '12px' }}>
                      This removes @{editStaff.username} from this device and the Cloud database.
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ flex: 1, border: '1px solid #D1D5DB' }}
                        onClick={() => setDeleteConfirming(false)}
                        disabled={actionLoadingId === editStaff.id}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        style={{ flex: 1.5, background: '#DC2626', color: '#FFF' }}
                        onClick={() => executeDelete(editStaff)}
                        disabled={actionLoadingId === editStaff.id}
                      >
                        {actionLoadingId === editStaff.id ? 'Deleting...' : 'Yes, Delete Permanently'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => setDeleteConfirming(true)}
                  >
                    <Trash2 size={14} /> Delete User Permanently
                  </button>
                )}
              </div>
            )}
          </div>
        </div></Portal>
      )}

      {/* Standalone Card Delete Confirmation Modal */}
      {staffToDelete && (
        <Portal>
          <div className="modal-overlay" onClick={() => setStaffToDelete(null)}>
            <div className="modal" style={{ maxWidth: '420px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <Trash2 size={24} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', marginBottom: '8px' }}>
                Delete Staff Member?
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                Are you sure you want to permanently delete <strong>{staffToDelete.fullName}</strong> (@{staffToDelete.username})? This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ flex: 1, border: '1px solid var(--black-border)' }}
                  onClick={() => setStaffToDelete(null)}
                  disabled={actionLoadingId === staffToDelete.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ flex: 1.2, background: '#DC2626', color: '#FFF' }}
                  onClick={() => executeDelete(staffToDelete)}
                  disabled={actionLoadingId === staffToDelete.id}
                >
                  {actionLoadingId === staffToDelete.id ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}

