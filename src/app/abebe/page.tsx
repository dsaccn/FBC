'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Terminal, Database, RefreshCw, AlertTriangle, Shield, ShieldAlert,
  Search, Plus, Trash2, Edit3, ArrowRight, Download, CheckCircle2,
  XCircle, Clock, HardDrive, Eye, EyeOff, Layers, ExternalLink,
  ChevronRight, Lock, Unlock, Filter, LogOut, KeyRound, User as UserIcon,
  Copy, Check
} from 'lucide-react'

interface ModelMeta {
  id: string
  name: string
  category: string
  primaryKey: string
  description: string
}

interface AuthUser {
  id: string
  username: string
  fullName?: string
  role: string
}

export default function AbebeDeveloperPortal() {
  // Auth state: default to 'unauthenticated' so the Login Page is ALWAYS presented first on /abebe
  const [authStatus, setAuthStatus] = useState<'unauthenticated' | 'authenticated'>('unauthenticated')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginMode, setLoginMode] = useState<'signin' | 'edit_credentials'>('signin')

  // Master Credentials & Security State
  const [credUsername, setCredUsername] = useState('')
  const [credCurrentPassword, setCredCurrentPassword] = useState('')
  const [credNewPassword, setCredNewPassword] = useState('')
  const [credConfirmPassword, setCredConfirmPassword] = useState('')
  const [credLoading, setCredLoading] = useState(false)
  const [credError, setCredError] = useState('')
  const [credSuccess, setCredSuccess] = useState('')
  const [credProfile, setCredProfile] = useState<any | null>(null)
  const [showCredNew, setShowCredNew] = useState(false)
  const [showCredCurrent, setShowCredCurrent] = useState(false)
  const [copiedCreds, setCopiedCreds] = useState(false)

  // Developer Flight Control state
  const [activeTab, setActiveTab] = useState<'explorer' | 'sync' | 'integrity' | 'audit' | 'security'>('explorer')
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

  // Health State
  const [healthData, setHealthData] = useState<any | null>(null)

  // Integrity State
  const [integrityData, setIntegrityData] = useState<any | null>(null)
  const [scanningIntegrity, setScanningIntegrity] = useState<boolean>(false)

  // Dev Audit State
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditTotal, setAuditTotal] = useState<number>(0)

  // 1. Only restore flight control session if explicitly unlocked in this tab
  useEffect(() => {
    async function checkAuth() {
      const isUnlocked = typeof window !== 'undefined' && sessionStorage.getItem('abebe_unlocked') === 'true'
      if (!isUnlocked) {
        setAuthStatus('unauthenticated')
        return
      }

      try {
        const res = await fetch('/api/abebe/auth')
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated && data.user?.role === 'ADMIN') {
            setCurrentUser(data.user)
            setAuthStatus('authenticated')
            return
          }
        }
      } catch (err) {
        console.error('Session check error:', err)
      }

      if (typeof window !== 'undefined') sessionStorage.removeItem('abebe_unlocked')
      setAuthStatus('unauthenticated')
    }
    checkAuth()
  }, [])

  // 2. Load models & stats when authenticated
  useEffect(() => {
    if (authStatus !== 'authenticated') return

    fetch('/api/system/models')
      .then(res => res.json())
      .then(data => {
        if (data.models) setModels(data.models)
      })
      .catch(console.error)

    refreshHealth()
    refreshSync()
  }, [authStatus])

  // 3. Dismiss modals on Escape
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

  // 4. Load records on model, page, tab change
  useEffect(() => {
    if (authStatus === 'authenticated' && activeTab === 'explorer') {
      loadRecords()
    }
  }, [selectedModel, page, activeTab, authStatus])

  // 5. Load specific tab data when switched
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    if (activeTab === 'sync') refreshSync()
    if (activeTab === 'integrity') runIntegrityScan()
    if (activeTab === 'audit') loadAuditLogs()
    if (activeTab === 'security') loadCredentialsProfile()
  }, [activeTab, authStatus])

  // Auth Handlers (Standalone Abebe Session)
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')

    try {
      const res = await fetch('/api/abebe/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      })

      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error || 'Invalid administrator credentials')
        setLoginLoading(false)
        return
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('abebe_unlocked', 'true')
      }
      setCurrentUser(data.user)
      setAuthStatus('authenticated')
      setLoginLoading(false)
    } catch {
      setLoginError('Network connection failed. Please try again.')
      setLoginLoading(false)
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/abebe/auth', { method: 'DELETE' })
    } catch {}
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('abebe_unlocked')
    }
    setCurrentUser(null)
    setAuthStatus('unauthenticated')
    setLoginPassword('')
  }

  // Master Credentials Handlers
  async function loadCredentialsProfile() {
    try {
      const res = await fetch('/api/abebe/credentials')
      if (res.ok) {
        const data = await res.json()
        setCredProfile(data)
        setCredUsername(data.username || '')
      }
    } catch (err) {
      console.error('Failed to load credentials profile:', err)
    }
  }

  async function handleUpdateCredentials(e: React.FormEvent) {
    e.preventDefault()
    setCredLoading(true)
    setCredError('')
    setCredSuccess('')

    if (credNewPassword !== credConfirmPassword) {
      setCredError('New password and confirmation do not match.')
      setCredLoading(false)
      return
    }

    try {
      const res = await fetch('/api/abebe/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentUsername: currentUser?.username || credUsername,
          currentPassword: credCurrentPassword,
          newUsername: credUsername.trim(),
          newPassword: credNewPassword,
          confirmPassword: credConfirmPassword,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setCredError(data.error || 'Failed to update credentials')
        setCredLoading(false)
        return
      }

      setCredSuccess(data.message || 'Credentials updated successfully across local and cloud databases.')
      if (data.user) {
        setCurrentUser(data.user)
      }
      setCredCurrentPassword('')
      setCredNewPassword('')
      setCredConfirmPassword('')
      loadCredentialsProfile()
      setTimeout(() => setCredSuccess(''), 6000)
    } catch (err: any) {
      setCredError(err.message || 'Network error updating credentials')
    } finally {
      setCredLoading(false)
    }
  }

  async function handleLoginScreenUpdateCredentials(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')

    if (credNewPassword !== credConfirmPassword) {
      setLoginError('New password and confirmation do not match.')
      setLoginLoading(false)
      return
    }

    try {
      const res = await fetch('/api/abebe/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentUsername: loginUsername.trim(),
          currentPassword: loginPassword,
          newUsername: credUsername.trim(),
          newPassword: credNewPassword,
          confirmPassword: credConfirmPassword,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error || 'Failed to update credentials')
        setLoginLoading(false)
        return
      }

      sessionStorage.setItem('abebe_unlocked', 'true')
      if (data.user) setCurrentUser(data.user)
      setAuthStatus('authenticated')
      setActionSuccess(`Credentials updated! Logged into flight control as ${data.user?.username || credUsername.trim()}`)
    } catch {
      setLoginError('Network failure while updating credentials.')
    } finally {
      setLoginLoading(false)
    }
  }

  // Developer Flight Control Handlers
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
        setActionSuccess(data.message || 'Sync cycle completed!')
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

  async function loadAuditLogs() {
    try {
      const res = await fetch('/api/system/audit')
      const data = await res.json()
      if (res.ok) {
        setAuditLogs(data.logs || [])
        setAuditTotal(data.total || 0)
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
    if (!editReason.trim()) {
      setActionError('Audit reason is required to modify database records.')
      return
    }

    try {
      if (isCreating) {
        const res = await fetch('/api/system/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            data: editFormData,
            reason: editReason.trim(),
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setActionSuccess(`Created record in ${selectedModel}`)
          setIsCreating(false)
          loadRecords()
          setTimeout(() => setActionSuccess(''), 4000)
        } else {
          setActionError(data.error || 'Failed to create record')
        }
      } else {
        const res = await fetch('/api/system/records', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            id: selectedRecord.id,
            data: editFormData,
            reason: editReason.trim(),
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setActionSuccess(`Updated ${selectedModel} record`)
          setIsEditing(false)
          loadRecords()
          setTimeout(() => setActionSuccess(''), 4000)
        } else {
          setActionError(data.error || 'Failed to update record')
        }
      }
    } catch (e: any) {
      setActionError(e.message)
    }
  }

  async function handleDeleteRecord(id: string) {
    if (!writeMode) return
    const reason = prompt(`Enter reason for deleting record ${id} from ${selectedModel}:`)
    if (!reason || !reason.trim()) return

    try {
      const q = new URLSearchParams({ model: selectedModel, id, reason: reason.trim() })
      const res = await fetch(`/api/system/records?${q.toString()}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setActionSuccess(`Deleted record ${id} from ${selectedModel}`)
        loadRecords()
        setTimeout(() => setActionSuccess(''), 4000)
      } else {
        setActionError(data.error || 'Delete failed')
      }
    } catch (e: any) {
      setActionError(e.message)
    }
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

  const recordColumns = records.length > 0 ? Object.keys(records[0]) : []

  // ── VIEW 1: STANDALONE LOGIN SCREEN AT /abebe ──
  if (authStatus === 'unauthenticated') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 50% 20%, #172033 0%, #0D131F 50%, #06090E 100%)',
        color: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'Inter', sans-serif",
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle background glow */}
        <div style={{
          position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(212, 175, 55, 0.08) 0%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none'
        }} />

        <div style={{
          width: '100%', maxWidth: '440px',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(212, 175, 55, 0.05)',
          backdropFilter: 'blur(16px)',
          borderRadius: '16px',
          padding: '36px 32px',
          position: 'relative',
          zIndex: 1
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              width: '46px', height: '46px', borderRadius: '12px',
              background: '#0F172A', border: '1px solid #334155',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#D4AF37', marginBottom: '14px'
            }}>
              <Terminal size={22} />
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em', margin: 0, color: '#FFFFFF' }}>
              Developer Flight Control
            </h1>

            {/* Mode Switcher: Sign In vs Standalone Credentials Editor */}
            <div style={{ display: 'flex', background: '#0B111E', padding: '3px', borderRadius: '8px', border: '1px solid #1E293B', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => { setLoginMode('signin'); setLoginError('') }}
                style={{
                  flex: 1, padding: '7px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                  background: loginMode === 'signin' ? '#1E293B' : 'transparent',
                  color: loginMode === 'signin' ? '#FFFFFF' : '#94A3B8',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s ease'
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMode('edit_credentials')
                  setLoginError('')
                  setCredUsername(loginUsername || 'ROOT')
                }}
                style={{
                  flex: 1, padding: '7px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                  background: loginMode === 'edit_credentials' ? '#1E293B' : 'transparent',
                  color: loginMode === 'edit_credentials' ? '#D4AF37' : '#94A3B8',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s ease'
                }}
              >
                Edit Credentials
              </button>
            </div>
          </div>

          {/* Error Message */}
          {loginError && (
            <div style={{
              background: 'rgba(220, 38, 38, 0.12)', border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#FCA5A5',
              marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{loginError}</span>
            </div>
          )}

          {/* MODE 1: Standard Standalone Sign In Form */}
          {loginMode === 'signin' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#CBD5E1', marginBottom: '6px' }}>
                  Admin Username
                </label>
                <div style={{ position: 'relative' }}>
                  <UserIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Enter administrator username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px 10px 38px',
                      borderRadius: '8px', border: '1px solid #334155',
                      background: '#0B111E', color: '#FFFFFF', fontSize: '13px',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#CBD5E1', marginBottom: '6px' }}>
                  Master Key / Password
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter administrator password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 40px 10px 38px',
                      borderRadius: '8px', border: '1px solid #334155',
                      background: '#0B111E', color: '#FFFFFF', fontSize: '13px',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                style={{
                  marginTop: '8px', padding: '12px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #D4AF37 0%, #B48A1E 100%)',
                  border: 'none', color: '#090D16', fontWeight: '700', fontSize: '13px',
                  letterSpacing: '0.02em', cursor: loginLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 4px 14px rgba(212, 175, 55, 0.3)',
                  transition: 'opacity 0.15s ease'
                }}
              >
                {loginLoading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <Lock size={15} />
                    <span>Access Flight Control</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* MODE 2: Standalone Edit Username & Password Form */}
          {loginMode === 'edit_credentials' && (
            <form onSubmit={handleLoginScreenUpdateCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#CBD5E1', marginBottom: '5px' }}>
                  Current Username
                </label>
                <div style={{ position: 'relative' }}>
                  <UserIcon size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                  <input
                    type="text"
                    required
                    placeholder="Current username (e.g. ROOT)"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px 9px 36px',
                      borderRadius: '8px', border: '1px solid #334155',
                      background: '#0B111E', color: '#FFFFFF', fontSize: '13px',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#CBD5E1', marginBottom: '5px' }}>
                  Current Password (To Authorize)
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                  <input
                    type={showCredCurrent ? 'text' : 'password'}
                    required
                    placeholder="Enter current password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 38px 9px 36px',
                      borderRadius: '8px', border: '1px solid #334155',
                      background: '#0B111E', color: '#FFFFFF', fontSize: '13px',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredCurrent(!showCredCurrent)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}
                  >
                    {showCredCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #1E293B', paddingTop: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#D4AF37', marginBottom: '5px' }}>
                  New Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter new administrator username"
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px',
                    borderRadius: '8px', border: '1px solid #D4AF37',
                    background: '#0B111E', color: '#FFFFFF', fontSize: '13px', fontWeight: '600',
                    outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#D4AF37', marginBottom: '5px' }}>
                  New Master Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCredNew ? 'text' : 'password'}
                    required
                    placeholder="Enter new password"
                    value={credNewPassword}
                    onChange={(e) => setCredNewPassword(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 38px 9px 12px',
                      borderRadius: '8px', border: '1px solid #D4AF37',
                      background: '#0B111E', color: '#FFFFFF', fontSize: '13px',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredNew(!showCredNew)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}
                  >
                    {showCredNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#CBD5E1', marginBottom: '5px' }}>
                  Confirm New Password
                </label>
                <input
                  type={showCredNew ? 'text' : 'password'}
                  required
                  placeholder="Confirm new password"
                  value={credConfirmPassword}
                  onChange={(e) => setCredConfirmPassword(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px',
                    borderRadius: '8px', border: `1px solid ${credConfirmPassword && credConfirmPassword !== credNewPassword ? '#EF4444' : '#334155'}`,
                    background: '#0B111E', color: '#FFFFFF', fontSize: '13px',
                    outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                style={{
                  marginTop: '6px', padding: '12px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #D4AF37 0%, #B48A1E 100%)',
                  border: 'none', color: '#090D16', fontWeight: '700', fontSize: '13px',
                  letterSpacing: '0.02em', cursor: loginLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 4px 14px rgba(212, 175, 55, 0.3)',
                  transition: 'opacity 0.15s ease'
                }}
              >
                {loginLoading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Syncing & Logging in...</span>
                  </>
                ) : (
                  <>
                    <KeyRound size={15} />
                    <span>Save New Credentials & Log In</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick link back to standard POS login / ordering */}
          <div style={{ marginTop: '22px', textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '16px' }}>
            <Link
              href="/dashboard/tables"
              style={{ fontSize: '12px', color: '#94A3B8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>← Return to Restaurant POS & Ordering</span>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── VIEW 3: FULL STANDALONE DEVELOPER PORTAL (/abebe) ──
  return (
    <div style={{
      minHeight: '100vh', background: '#F8FAFC', color: '#0F172A',
      fontFamily: "'Inter', sans-serif", padding: '24px 28px', maxWidth: '1600px', margin: '0 auto'
    }}>
      {/* Flight Control Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '20px', flexWrap: 'wrap', gap: '16px', background: '#FFFFFF',
        padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37' }}>
              <Terminal size={19} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
                  Developer & System Flight Control
                </h1>

              </div>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                Dual-database flight control, 18-table CRUD, sync engine monitor, and integrity auditor.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls, Admin Status & Lock Console */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
              fontSize: '12px', fontWeight: '500', background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#475569'
            }}>
              <HardDrive size={13} />
              <span>SQLite: {healthData.sqliteSizeFormatted}</span>
            </div>
          )}

          {/* Write Mode Guard Toggle */}
          <button
            onClick={() => {
              if (!writeMode) {
                const confirmed = confirm('ENABLE DEVELOPER WRITE MODE?\n\nThis enables direct low-level mutations, inserts, and deletes across all database tables. Every action is audited.')
                if (confirmed) setWriteMode(true)
              } else {
                setWriteMode(false)
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              background: writeMode ? '#FEF2F2' : '#F1F5F9',
              border: `1px solid ${writeMode ? '#FECACA' : '#CBD5E1'}`,
              color: writeMode ? '#DC2626' : '#475569',
            }}
          >
            {writeMode ? <Unlock size={13} /> : <Lock size={13} />}
            <span>{writeMode ? 'Write Mode: ACTIVE' : 'Read-Only Mode'}</span>
          </button>

          {/* User Session Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: '#0F172A', color: '#FFFFFF', fontSize: '12px', fontWeight: '600' }}>
            <UserIcon size={13} style={{ color: '#D4AF37' }} />
            <span>{currentUser?.fullName || currentUser?.username} (ADMIN)</span>
          </div>

          {/* Edit Credentials Quick Action Button */}
          <button
            onClick={() => setActiveTab('security')}
            title="Edit Master Administrator Username & Password"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px',
              fontSize: '12px', fontWeight: '700', cursor: 'pointer',
              background: activeTab === 'security' ? '#0F172A' : '#FEF3C7',
              border: `1px solid ${activeTab === 'security' ? '#0F172A' : '#FDE68A'}`,
              color: activeTab === 'security' ? '#D4AF37' : '#92400E',
            }}
          >
            <KeyRound size={13} />
            <span>Edit Credentials</span>
          </button>

          {/* Lock / Log Out */}
          <button
            onClick={handleLogout}
            title="Lock Console and Return to Login"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer', background: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48'
            }}
          >
            <LogOut size={13} />
            <span>Lock</span>
          </button>

          {/* Jump to Ordering POS */}
          <Link
            href="/dashboard/tables"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px',
              fontSize: '12px', fontWeight: '600', textDecoration: 'none', background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#334155'
            }}
          >
            <ExternalLink size={13} />
            <span>POS App</span>
          </Link>
        </div>
      </div>

      {/* Global Action Alerts */}
      {actionSuccess && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={15} />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={15} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px', flexWrap: 'wrap' }}>
        {[
          { id: 'explorer', label: '18-Table Data Explorer & CRUD', icon: <Database size={15} /> },
          { id: 'sync', label: 'Sync Flight Control', icon: <RefreshCw size={15} /> },
          { id: 'integrity', label: 'Financial Integrity Scanner', icon: <ShieldAlert size={15} /> },
          { id: 'audit', label: 'Developer Audit Trail', icon: <Clock size={15} /> },
          { id: 'security', label: 'Security & Master Credentials', icon: <KeyRound size={15} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px',
              fontSize: '13px', fontWeight: activeTab === tab.id ? '700' : '500', cursor: 'pointer',
              background: activeTab === tab.id ? '#0F172A' : '#FFFFFF',
              color: activeTab === tab.id ? '#FFFFFF' : '#64748B',
              border: `1px solid ${activeTab === tab.id ? '#0F172A' : '#CBD5E1'}`,
              transition: 'all 0.15s ease'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: 18-TABLE DATA EXPLORER */}
      {activeTab === 'explorer' && (
        <div>
          {/* Controls Bar: Model Selector, Search, Insert */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '300px' }}>
              <select
                value={selectedModel}
                onChange={(e) => { setSelectedModel(e.target.value); setPage(1); }}
                style={{
                  padding: '9px 14px', borderRadius: '8px', border: '1px solid #CBD5E1',
                  background: '#FFFFFF', color: '#0F172A', fontSize: '13px', fontWeight: '600',
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
                    border: '1px solid #CBD5E1', background: '#FFFFFF',
                    color: '#0F172A', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                onClick={loadRecords}
                style={{
                  padding: '9px 16px', borderRadius: '8px', background: '#FFFFFF', border: '1px solid #CBD5E1',
                  fontSize: '13px', fontWeight: '600', cursor: 'pointer', color: '#334155'
                }}
              >
                Search
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={openCreateModal}
                disabled={!writeMode}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 16px',
                  borderRadius: '8px', background: writeMode ? '#059669' : '#E2E8F0', border: 'none',
                  color: writeMode ? '#FFFFFF' : '#94A3B8', fontWeight: '600', cursor: writeMode ? 'pointer' : 'not-allowed'
                }}
              >
                <Plus size={14} />
                <span>Insert {selectedModel}</span>
              </button>

              <a
                href={`/api/system/export?model=${selectedModel}&format=json`}
                download
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 14px',
                  borderRadius: '8px', background: '#FFFFFF', border: '1px solid #CBD5E1', color: '#334155',
                  textDecoration: 'none', fontWeight: '500'
                }}
              >
                <Download size={14} />
                <span>Export JSON</span>
              </a>
            </div>
          </div>

          {/* High-Density Data Grid */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ overflowX: 'auto', maxHeight: '650px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                              <button
                                onClick={() => jumpToRelation('OrderItem', row.id)}
                                title="Jump to Order Items"
                                style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #BFDBFE', background: '#EFF6FF', cursor: 'pointer', color: '#1D4ED8', fontSize: '11px', fontWeight: '600' }}
                              >
                                Items →
                              </button>
                            )}
                          </div>
                        </td>
                        {recordColumns.map(col => {
                          const val = row[col]
                          let displayVal = ''
                          if (val === null || val === undefined) displayVal = '—'
                          else if (typeof val === 'boolean') displayVal = val ? 'true' : 'false'
                          else if (typeof val === 'object') displayVal = JSON.stringify(val)
                          else displayVal = String(val)

                          const isIdCol = col.endsWith('Id') && typeof val === 'string' && val.length > 5
                          return (
                            <td key={col} style={{ padding: '8px 14px', whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {isIdCol ? (
                                <span
                                  onClick={() => {
                                    const targetModel = col.replace(/Id$/, '')
                                    jumpToRelation(targetModel.charAt(0).toUpperCase() + targetModel.slice(1), val)
                                  }}
                                  style={{ color: '#2563EB', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'monospace' }}
                                >
                                  {val}
                                </span>
                              ) : col === 'id' ? (
                                <span style={{ fontFamily: 'monospace', color: '#0F172A', fontWeight: '600' }}>{displayVal}</span>
                              ) : col === 'pendingSync' ? (
                                <span style={{
                                  padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                                  background: val ? '#FEF3C7' : '#D1FAE5', color: val ? '#D97706' : '#059669'
                                }}>
                                  {val ? 'PENDING' : 'SYNCED'}
                                </span>
                              ) : (
                                displayVal
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

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B' }}>
              <div>
                Showing {records.length} of {totalCount} total records in <strong>{selectedModel}</strong>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
                >
                  Previous
                </button>
                <span>Page {page} of {Math.max(1, Math.ceil(totalCount / 25))}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= Math.ceil(totalCount / 25)}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: page >= Math.ceil(totalCount / 25) ? 'not-allowed' : 'pointer', opacity: page >= Math.ceil(totalCount / 25) ? 0.5 : 1 }}
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
          {/* Neon Cloud Connectivity Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={20} color="#059669" />
                  <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>AWS Neon PostgreSQL Serverless Connection</h3>
                </div>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Centralized upstream cloud database backing online orders and multi-terminal sync.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>Status</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: syncData?.cloud?.status === 'CONNECTED' ? '#059669' : '#DC2626' }}>
                    {syncData?.cloud?.status || 'CHECKING...'}
                  </div>
                </div>
                {syncData?.cloud?.latencyMs && (
                  <div style={{ textAlign: 'right', paddingLeft: '16px', borderLeft: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>Ping Latency</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>
                      {syncData.cloud.latencyMs} ms
                    </div>
                  </div>
                )}
                <button
                  onClick={refreshSync}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                >
                  <RefreshCw size={14} />
                  <span>Test Ping</span>
                </button>
              </div>
            </div>
          </div>

          {/* Pending Queue Breakdown */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>
                    {syncData?.isCloud ? 'Cloud Sync Status (Neon PostgreSQL)' : 'Pending Synchronization Queue'}
                  </h3>
                  {syncData?.isCloud && (
                    <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px', background: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
                      Cloud Direct Mode
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                  {syncData?.isCloud
                    ? 'Running live on Vercel connected directly to Neon. All records are centralized and synced.'
                    : `Total of ${syncData?.totalPending ?? 0} local records waiting to push to the cloud.`}
                </p>
              </div>
              <button
                onClick={triggerManualSync}
                disabled={syncing}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px',
                  borderRadius: '8px', background: '#0F172A', color: '#FFFFFF', border: 'none', fontWeight: '600', cursor: syncing ? 'not-allowed' : 'pointer'
                }}
              >
                <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                <span>{syncing ? 'Synchronizing...' : syncData?.isCloud ? 'Reconcile Cloud State' : 'Force Full Sync Now'}</span>
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
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Financial & Business Logic Integrity Scanner</h3>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                Detects orphaned orders, table discrepancies, negative stock, and anomalous discounts.
              </p>
            </div>
            <button
              onClick={runIntegrityScan}
              disabled={scanningIntegrity}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', fontSize: '13px',
                borderRadius: '8px', background: '#0F172A', color: '#FFFFFF', border: 'none', fontWeight: '600', cursor: scanningIntegrity ? 'not-allowed' : 'pointer'
              }}
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
                <div style={{ padding: '40px', textAlign: 'center', color: '#059669', background: '#ECFDF5', borderRadius: '8px', border: '1px solid #A7F3D0' }}>
                  <CheckCircle2 size={32} style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: '700', fontSize: '15px' }}>Zero Integrity Anomalies Found</div>
                  <div style={{ fontSize: '12px', color: '#065F46', marginTop: '4px' }}>
                    All financial relations, table statuses, and inventory balances are healthy.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {integrityData.issues.map((iss: any, i: number) => (
                    <div key={i} style={{ padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '13px', color: iss.severity === 'HIGH' ? '#DC2626' : '#D97706' }}>
                          {iss.title}
                        </strong>
                        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#E2E8F0', color: '#475569' }}>
                          {iss.category}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>{iss.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DEVELOPER AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Developer Action Audit Trail</h3>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                Immutable historical log of all manual edits, direct table updates, deletions, and emergency syncs.
              </p>
            </div>
            <button
              onClick={loadAuditLogs}
              style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <RefreshCw size={13} />
              <span>Refresh Log</span>
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

      {/* TAB 5: STANDALONE MASTER SECURITY & CREDENTIALS MANAGEMENT */}
      {activeTab === 'security' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 420px) 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Column 1: Current Master Identity Profile */}
          <div style={{
            background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
            padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '10px',
                background: '#0F172A', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#D4AF37'
              }}>
                <Shield size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>
                  Master Identity
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Standalone Flight Control Profile
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Current Username
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', padding: '10px 14px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <code style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>
                    {currentUser?.username || credUsername || 'ROOT'}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(currentUser?.username || credUsername || 'ROOT')
                      setCopiedCreds(true)
                      setTimeout(() => setCopiedCreds(false), 2000)
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '2px' }}
                    title="Copy Username"
                  >
                    {copiedCreds ? <Check size={14} style={{ color: '#10B981' }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Role & Privileges
                </span>
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', fontSize: '12px', fontWeight: '700' }}>
                    ADMIN (Superuser)
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Dual-Database Root</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Database Sync Targets
                </span>
                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                    <span>Local SQLite (diva-addis.db) — Primary</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: syncData?.cloud?.status === 'CONNECTED' ? '#10B981' : '#F59E0B' }} />
                    <span>Neon Cloud PostgreSQL — {syncData?.cloud?.status === 'CONNECTED' ? 'Synchronized' : 'Standby'}</span>
                  </div>
                </div>
              </div>

              <div style={{
                background: '#F8FAFC', borderRadius: '8px', padding: '12px',
                border: '1px solid #E2E8F0', marginTop: '6px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>
                  <Lock size={13} style={{ color: '#D4AF37' }} />
                  <span>Decoupled Security Guarantee</span>
                </div>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748B', lineHeight: '1.5' }}>
                  This console operates independently of POS floor staff (cashiers & waiters). Updating credentials here updates both databases without disrupting shift operations.
                </p>
              </div>
            </div>
          </div>

          {/* Column 2: Edit Username & Password Form */}
          <div style={{
            background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
            padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0F172A' }}>
                  Edit Master Credentials
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748B' }}>
                  Change administrator username or master password. Updates are instantly committed to local and cloud databases.
                </p>
              </div>
            </div>

            {/* Error & Success Feedback */}
            {credError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 16px', borderRadius: '8px', marginBottom: '18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{credError}</span>
              </div>
            )}
            {credSuccess && (
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '12px 16px', borderRadius: '8px', marginBottom: '18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span>{credSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdateCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Administrator Username
                </label>
                <div style={{ position: 'relative' }}>
                  <UserIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="text"
                    required
                    value={credUsername}
                    onChange={(e) => setCredUsername(e.target.value)}
                    placeholder="e.g. ROOT or abebe"
                    style={{
                      width: '100%', padding: '10px 14px 10px 38px', borderRadius: '8px',
                      border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: '600',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>
                  The username used to unlock the developer portal at /abebe.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Current Master Password <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type={showCredCurrent ? 'text' : 'password'}
                    required
                    value={credCurrentPassword}
                    onChange={(e) => setCredCurrentPassword(e.target.value)}
                    placeholder="Enter current password to verify identity"
                    style={{
                      width: '100%', padding: '10px 40px 10px 38px', borderRadius: '8px',
                      border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredCurrent(!showCredCurrent)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}
                  >
                    {showCredCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    New Master Password <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                      type={showCredNew ? 'text' : 'password'}
                      required
                      value={credNewPassword}
                      onChange={(e) => setCredNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      style={{
                        width: '100%', padding: '10px 40px 10px 38px', borderRadius: '8px',
                        border: '1px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCredNew(!showCredNew)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}
                    >
                      {showCredNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Confirm New Password <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                      type={showCredNew ? 'text' : 'password'}
                      required
                      value={credConfirmPassword}
                      onChange={(e) => setCredConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      style={{
                        width: '100%', padding: '10px 14px 10px 38px', borderRadius: '8px',
                        border: `1px solid ${credConfirmPassword && credConfirmPassword !== credNewPassword ? '#EF4444' : '#CBD5E1'}`,
                        fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '18px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={credLoading}
                  style={{
                    padding: '11px 24px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                    color: '#D4AF37', fontWeight: '700', fontSize: '13px',
                    cursor: credLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)'
                  }}
                >
                  {credLoading ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Updating Both Databases...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound size={15} />
                      <span>Save & Sync Master Credentials</span>
                    </>
                  )}
                </button>
              </div>
            </form>
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
                style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRecord}
                disabled={!writeMode}
                style={{
                  padding: '8px 18px', fontSize: '13px', borderRadius: '6px', border: 'none',
                  background: '#0F172A', color: '#FFFFFF', fontWeight: '600',
                  cursor: writeMode ? 'pointer' : 'not-allowed', opacity: writeMode ? 1 : 0.5
                }}
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
