'use client'

import { Cpu } from 'lucide-react'

interface MebaLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showSubtitle?: boolean
  className?: string
}

export default function NexoraLogo({
  size = 'md',
  showSubtitle = true,
  className = '',
}: MebaLogoProps) {
  const isLg = size === 'lg'
  const isSm = size === 'sm'

  const iconSize = isLg ? 36 : isSm ? 18 : 22
  const iconContainerSize = isLg ? 'w-16 h-16 rounded-2xl' : isSm ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'

  return (
    <div className={`flex items-center gap-3 ${className}`} suppressHydrationWarning>
      {/* Glow Icon Container */}
      <div
        className={`${iconContainerSize} flex items-center justify-center flex-shrink-0 relative`}
        style={{
          background: 'linear-gradient(135deg, #031e2a 0%, #062b3a 100%)',
          border: '1.5px solid #00E5FF',
          boxShadow: '0 0 14px rgba(0, 229, 255, 0.25), inset 0 0 10px rgba(0, 229, 255, 0.15)',
        }}
      >
        <Cpu
          size={iconSize}
          style={{
            color: '#00E5FF',
            filter: 'drop-shadow(0 0 6px rgba(0, 229, 255, 0.6))',
          }}
        />
      </div>

      {/* Brand Text */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span
            className={`font-black tracking-wider ${
              isLg ? 'text-2xl' : isSm ? 'text-sm' : 'text-lg'
            }`}
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '0.05em',
              color: '#F0F4F8',
            }}
          >
            MEBA
          </span>
          <span
            className={`font-black tracking-wider ${
              isLg ? 'text-2xl' : isSm ? 'text-sm' : 'text-lg'
            }`}
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '0.05em',
              color: '#00E5FF',
              textShadow: '0 0 14px rgba(0, 229, 255, 0.4)',
            }}
          >
            TECH
          </span>
          <span
            className="font-bold uppercase px-1.5 py-0.5 rounded tracking-widest border"
            style={{
              fontSize: '9px',
              color: '#00E5FF',
              borderColor: 'rgba(0, 229, 255, 0.4)',
              background: 'rgba(0, 229, 255, 0.08)',
              lineHeight: '1',
            }}
          >
            PRO
          </span>
        </div>

        {showSubtitle && (
          <span
            className={`font-normal leading-tight mt-0.5 ${
              isLg ? 'text-xs' : isSm ? 'text-[9px]' : 'text-[10px]'
            }`}
            style={{ letterSpacing: '0.01em', color: '#6B8A99' }}
          >
            POS &amp; Management System
          </span>
        )}
      </div>
    </div>
  )
}
