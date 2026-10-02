'use client'

import { Menu, X } from 'lucide-react'
import NexoraLogo from '@/components/NexoraLogo'

interface MobileHeaderProps {
  isOpen: boolean
  onToggle: () => void
}

export default function MobileHeader({ isOpen, onToggle }: MobileHeaderProps) {
  return (
    <header className="mobile-header" suppressHydrationWarning>
      {/* Logo on the right via CSS order */}
      <div className="mobile-header-logo" suppressHydrationWarning style={{ order: 2 }}>
        <NexoraLogo size="sm" showSubtitle={false} />
      </div>

      {/* Hamburger on the left via CSS order */}
      <button
        className="hamburger-btn"
        onClick={onToggle}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        style={{ order: 1 }}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
    </header>
  )
}
