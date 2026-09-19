'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import MobileHeader from '@/components/MobileHeader'
import OfflineBanner from '@/components/OfflineBanner'
import { ToastProvider } from '@/components/ToastProvider'

interface Session {
  id: string
  username: string
  fullName?: string
  role: string
}

export default function DashboardLayout({ children, session }: { children: React.ReactNode; session: Session }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Offline/Sync status banner — fixed at top of screen */}
      <OfflineBanner />

      {/* Mobile top bar */}
      <MobileHeader isOpen={sidebarOpen} onToggle={() => setSidebarOpen(prev => !prev)} />

      {/* Sidebar — always rendered; CSS handles slide on mobile */}
      <Sidebar
        user={session}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-content" style={{ flex: 1 }}>
        {children}
      </main>
    </div>
    </ToastProvider>
  )
}
