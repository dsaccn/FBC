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
      {/* Logo */}
      <div className="mobile-header-logo" suppressHydrationWarning>
        <NexoraLogo size="sm" showSubtitle={false} />
      </div>

      {/* Hamburger / Close */}
      <button
        className="hamburger-btn"
        onClick={onToggle}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
    </header>
  )
}
