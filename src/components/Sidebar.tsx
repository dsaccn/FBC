'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutGrid, UtensilsCrossed, CreditCard, Users,
  Package, BarChart2, LogOut, ClipboardList,
  ChevronRight, ChefHat, Wifi, WifiOff, Sandwich, Bike, Terminal, QrCode
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  roles: string[]
}

import NexoraLogo from '@/components/NexoraLogo'

const navItems: NavItem[] = [
  { label: 'Tables', href: '/dashboard/tables', icon: <LayoutGrid size={18} />, roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  { label: 'Delivery', href: '/dashboard/delivery', icon: <Bike size={18} />, roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  { label: 'Orders', href: '/dashboard/orders', icon: <ClipboardList size={18} />, roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  { label: 'Payments', href: '/dashboard/payment', icon: <CreditCard size={18} />, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { label: 'QR Scanner', href: '/scanner', icon: <QrCode size={18} />, roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  { label: 'Menu', href: '/dashboard/menu', icon: <UtensilsCrossed size={18} />, roles: ['ADMIN'] },
  { label: 'Inventory', href: '/dashboard/inventory', icon: <Package size={18} />, roles: ['ADMIN', 'MANAGER'] },
  { label: 'Recipes', href: '/dashboard/recipes', icon: <ChefHat size={18} />, roles: ['ADMIN'] },
  { label: 'Staff', href: '/dashboard/staff', icon: <Users size={18} />, roles: ['ADMIN'] },
  { label: 'Reports', href: '/dashboard/reports', icon: <BarChart2 size={18} />, roles: ['ADMIN'] },
]

interface SidebarProps {
  user: { id: string; username: string; fullName?: string; role: string }
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ user, isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Poll pending sync count every 60s
    const checkPending = async () => {
      try {
        const res = await fetch('/api/sync', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setPendingCount(data.pendingCount ?? 0)
        }
      } catch { /* offline */ }
    }
    checkPending()
    const interval = setInterval(checkPending, 60_000)

    // React immediately to database write mutations or sync completions
    window.addEventListener('db-write-success', checkPending)
    window.addEventListener('sync-complete', checkPending)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('db-write-success', checkPending)
      window.removeEventListener('sync-complete', checkPending)
      clearInterval(interval)
    }
  }, [])

  const filtered = navItems.filter(item => item.roles.includes(user.role))

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  function handleNavClick() {
    onClose?.()
  }

  return (
    <>
      {/* Backdrop overlay — only rendered on mobile when open */}
      {onClose && (
        <div
          className={`sidebar-overlay${isOpen ? ' active' : ''}`}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar${isOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--black-border)' }}>
          <NexoraLogo size="sm" showSubtitle={false} />
        </div>

        {/* User info */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--black-border)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600' }}>{user.fullName || user.username}</div>
          <div style={{
            fontSize: '11px', marginTop: '4px', display: 'inline-flex',
            alignItems: 'center', gap: '4px', color: 'var(--gold)',
            background: 'rgba(201,168,76,0.08)', padding: '2px 8px',
            borderRadius: '10px', border: '1px solid rgba(201,168,76,0.2)'
          }}>
            {user.role}
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {filtered.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={active ? 'sidebar-link active' : 'sidebar-link'}
              >
                <span className="sidebar-icon-wrapper">
                  {item.icon}
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {active && <ChevronRight size={14} className="active-arrow" />}
              </Link>
            )
          })}
        </nav>

        {/* Logout + sync status */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--black-border)' }}>
          {/* Sync status row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', marginBottom: '6px',
            borderRadius: '8px',
            background: isOnline ? 'rgba(34,197,94,0.06)' : 'rgba(220,38,38,0.06)',
            border: `1px solid ${isOnline ? 'rgba(34,197,94,0.15)' : 'rgba(220,38,38,0.15)'}`,
          }}>
            {isOnline
              ? <Wifi size={13} style={{ color: '#22c55e' }} />
              : <WifiOff size={13} style={{ color: '#ef4444' }} />
            }
            <span style={{
              fontSize: '11px', fontWeight: '500',
              color: isOnline ? '#22c55e' : '#ef4444',
            }}>
              {isOnline ? (pendingCount > 0 ? `${pendingCount} pending sync` : 'Synced') : 'Offline'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', gap: '10px', padding: '11px 12px' }}
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
