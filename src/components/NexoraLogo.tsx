'use client'

import { Cpu } from 'lucide-react'

interface NexoraLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showSubtitle?: boolean
  className?: string
}

export default function NexoraLogo({
  size = 'md',
  showSubtitle = true,
  className = '',
}: NexoraLogoProps) {
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
          border: '1.5px solid #00F0FF',
          boxShadow: '0 0 14px rgba(0, 240, 255, 0.25), inset 0 0 10px rgba(0, 240, 255, 0.15)',
        }}
      >
        <Cpu
          size={iconSize}
          className="text-[#00F0FF]"
          style={{
            filter: 'drop-shadow(0 0 6px rgba(0, 240, 255, 0.6))',
          }}
        />
      </div>

      {/* Brand Text */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span
            className={`font-black tracking-wider text-white ${
              isLg ? 'text-2xl' : isSm ? 'text-sm' : 'text-lg'
            }`}
            style={{ fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '0.04em' }}
          >
            NEXORA
          </span>
          <span
            className={`font-black tracking-wider text-[#00E699] ${
              isLg ? 'text-2xl' : isSm ? 'text-sm' : 'text-lg'
            }`}
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '0.04em',
              textShadow: '0 0 12px rgba(0, 230, 153, 0.4)',
            }}
          >
            TECH
          </span>
          <span
            className="text-[#00E699] font-bold text-[9px] uppercase px-1.5 py-0.5 rounded tracking-widest border"
            style={{
              borderColor: 'rgba(0, 230, 153, 0.4)',
              background: 'rgba(0, 230, 153, 0.08)',
              lineHeight: '1',
            }}
          >
            PRO
          </span>
        </div>

        {showSubtitle && (
          <span
            className={`text-slate-400 font-normal leading-tight mt-0.5 ${
              isLg ? 'text-xs' : isSm ? 'text-[9px]' : 'text-[10px]'
            }`}
            style={{ letterSpacing: '0.01em' }}
          >
            Intercity Transport & Digital Seat Ticketing Management
          </span>
        )}
      </div>
    </div>
  )
}
