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
      {/* Hamburger on the left */}
      <button
        className="hamburger-btn"
        onClick={onToggle}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Logo centered / right */}
      <div className="mobile-header-logo" suppressHydrationWarning>
        <NexoraLogo size="sm" showSubtitle={false} />
      </div>
    </header>
  )
}
