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

  function openNew() { setEditStaff(null); setForm(EMPTY); setShowForm(true) }
  function openEdit(s: Staff) { setEditStaff(s); setForm({ username: s.username, fullName: s.fullName, password: '', role: s.role, phone: s.phone || '' }); setShowForm(true) }

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

  async function deleteStaff(s: Staff) {
    if (!confirm(`Permanently delete "${s.fullName}" (${s.username})? This cannot be undone and will remove all their orders and records.`)) return
    try {
      const res = await fetch(`/api/staff/${s.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to delete staff member')
        return
      }
      toast.success(`${s.fullName} deleted permanently`)
      setShowForm(false)
      load()
    } catch {
      toast.error('Network error deleting staff member')
    }
  }

  async function toggleActive(s: Staff) {
    try {
      const nextActive = !s.active
      const res = await fetch(`/api/staff/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive })
      })
      if (res.ok) {
        toast.info(`Staff member ${nextActive ? 'activated' : 'deactivated'}`)
        load()
      } else {
        toast.error('Failed to change staff status')
      }
    } catch {
      toast.error('Network error updating staff status')
    }
  }

  const roleColors: Record<string, string> = { ADMIN: 'var(--gold)', MANAGER: 'var(--warning-light)', CASHIER: 'var(--success-light)', WAITER: 'var(--text-secondary)' }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="font-cinzel" style={{ fontSize: '22px', fontWeight: '700' }}><span className="gold-text">Staff Management</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>{staff.filter(s => s.active).length} active · {staff.filter(s => !s.active).length} inactive</p>
        </div>
        <button className="btn btn-gold btn-sm" onClick={openNew}><Plus size={14} /> Add Staff</button>
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
        ) : staff.map(s => (
          <div key={s.id} className="card" style={{ opacity: s.active ? 1 : 0.5, transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: 'var(--gold)', flexShrink: 0 }}>
                  {s.fullName.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: '600' }}>{s.fullName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>@{s.username}</div>
                </div>
              </div>
              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '10px', background: `${roleColors[s.role]}22`, color: roleColors[s.role], fontWeight: '600', border: `1px solid ${roleColors[s.role]}44`, whiteSpace: 'nowrap' }}>
                {s.role}
              </span>
            </div>
            {s.phone && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>📞 {s.phone}</div>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openEdit(s)}><Pencil size={13} /> Edit</button>
              <button className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-success'}`} style={{ flex: 1 }} onClick={() => toggleActive(s)}>
                {s.active ? <><UserX size={13} /> Deactivate</> : <><UserCheck size={13} /> Activate</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Staff Form Modal */}
      {showForm && (
        <Portal><div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editStaff ? 'Edit Staff' : 'Add New Staff'}</h3>
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
                <label className="input-label">{editStaff ? 'New Password (leave blank)' : 'Password'}</label>
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
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--black-border)' }}>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => deleteStaff(editStaff)}
                >
                  <Trash2 size={14} /> Delete User Permanently
                </button>
              </div>
            )}
          </div>
        </div></Portal>
      )}
    </div>
  )
}
