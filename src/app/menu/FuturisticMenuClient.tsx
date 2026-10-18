'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search,
  X,
  Coffee,
  Sparkles,
  Zap,
  Flame,
  Shield,
  Layers,
  Activity,
  Cpu,
  Info,
  CheckCircle,
  Eye,
  SlidersHorizontal,
  ChevronRight,
  Radio,
  Clock,
  Compass
} from 'lucide-react'

export interface MenuItemData {
  id: string
  name: string
  description: string | null
  price: number
  available: boolean
  categoryId: string | null
  categoryName?: string
  categoryType?: string
}

export interface CategoryData {
  id: string
  name: string
  type: string
}

interface FuturisticMenuProps {
  items: MenuItemData[]
  categories: CategoryData[]
}

export default function FuturisticMenuClient({ items, categories }: FuturisticMenuProps) {
  const searchParams = useSearchParams()
  const tableParam = searchParams.get('table') || searchParams.get('t') || null

  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [fastingOnly, setFastingOnly] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null)
  const [currentTime, setCurrentTime] = useState<string>('')

  // Live digital HUD clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (activeTab !== 'ALL' && item.categoryId !== activeTab) {
        return false
      }
      // Fasting filter
      if (fastingOnly) {
        const isFasting =
          item.name.toLowerCase().includes('fasting') ||
          (item.description && item.description.toLowerCase().includes('dairy-free')) ||
          (item.description && item.description.toLowerCase().includes('fasting'))
        if (!isFasting) return false
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const nameMatch = item.name.toLowerCase().includes(q)
        const descMatch = item.description ? item.description.toLowerCase().includes(q) : false
        const catMatch = item.categoryName ? item.categoryName.toLowerCase().includes(q) : false
        if (!nameMatch && !descMatch && !catMatch) return false
      }
      return true
    })
  }, [items, activeTab, fastingOnly, searchQuery])

  // Group items by category when 'ALL' is selected
  const groupedCategories = useMemo(() => {
    if (activeTab !== 'ALL' || searchQuery.trim() || fastingOnly) {
      return null
    }
    const groups: { category: CategoryData; items: MenuItemData[] }[] = []
    for (const cat of categories) {
      const catItems = items.filter((i) => i.categoryId === cat.id)
      if (catItems.length > 0) {
        groups.push({ category: cat, items: catItems })
      }
    }
    // Items without a category
    const uncategorized = items.filter((i) => !i.categoryId)
    if (uncategorized.length > 0) {
      groups.push({
        category: { id: 'other', name: 'Specialty & Extras', type: 'OTHER' },
        items: uncategorized,
      })
    }
    return groups
  }, [items, categories, activeTab, searchQuery, fastingOnly])

  return (
    <div className="min-h-screen bg-[#05070B] text-[#E0E7FF] font-sans relative selection:bg-[#00F0FF] selection:text-[#05070B] overflow-x-hidden">
      {/* ───────────────────────────────────────────────────────────
          FUTURISTIC BACKGROUND: CYBER GRID & AMBIENT AURORA
      ─────────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0, 240, 255, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 240, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '36px 36px',
        }}
      />
      {/* Glowing neon plasma orbs */}
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-[#00F0FF]/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed top-1/3 -right-40 w-96 h-96 bg-[#FFB800]/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="fixed -bottom-40 left-1/4 w-[500px] h-[500px] bg-[#7000FF]/10 blur-[140px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-4 sm:py-6">
        {/* ───────────────────────────────────────────────────────────
            HUD STATUS TOP BAR
        ─────────────────────────────────────────────────────────── */}
        <header className="rounded-2xl bg-[#090D16]/80 backdrop-blur-xl border border-[#00F0FF]/25 p-4 shadow-[0_0_25px_rgba(0,240,255,0.08)] mb-4">
          <div className="flex items-center justify-between text-[11px] font-mono tracking-wider text-[#7988A3] border-b border-white/5 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F0FF] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F0FF]" />
              </span>
              <span className="text-[#00F0FF] font-semibold">KOGNA // SYS.ONLINE</span>
            </div>

            <div className="flex items-center gap-3">
              {tableParam && (
                <div className="px-2 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/30 font-bold">
                  TABLE: #{tableParam}
                </div>
              )}
              <div className="flex items-center gap-1 text-[#94A3B8]">
                <Clock className="w-3 h-3 text-[#00F0FF]" />
                <span>{currentTime || 'LIVE'}</span>
              </div>
            </div>
          </div>

          {/* Logo & Headline */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-widest bg-gradient-to-r from-[#FFFFFF] via-[#E0F7FA] to-[#00F0FF] bg-clip-text text-transparent font-mono">
                  KOGNA COFFEE
                </h1>
                <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/30 font-mono font-bold">
                  HUD v3.0
                </span>
              </div>
              <p className="text-[11px] text-[#8696B4] font-mono tracking-wide mt-0.5">
                // QUANTUM BEVERAGE MATRIX • ADDIS ABABA
              </p>
            </div>

            {/* Futuristic Holographic Emblem */}
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00F0FF]/30 via-[#0A1220] to-[#7000FF]/30 p-[1px] shadow-[0_0_15px_rgba(0,240,255,0.2)]">
              <div className="w-full h-full bg-[#070A11] rounded-[11px] flex items-center justify-center">
                <Coffee className="w-5 h-5 text-[#00F0FF]" />
              </div>
            </div>
          </div>
        </header>

        {/* ───────────────────────────────────────────────────────────
            SEARCH & FASTING MATRIX FILTER
        ─────────────────────────────────────────────────────────── */}
        <div className="space-y-3 mb-4">
          {/* Cyber Search Input */}
          <div className="relative group">
            <div className="absolute -inset-[1px] bg-gradient-to-r from-[#00F0FF]/30 via-[#7000FF]/20 to-[#FFB800]/30 rounded-xl blur-[2px] opacity-70 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative rounded-xl bg-[#090D16] border border-[#00F0FF]/30 flex items-center px-3.5 py-2.5">
              <Search className="w-4 h-4 text-[#00F0FF] flex-shrink-0 mr-2.5" />
              <input
                type="text"
                placeholder="SEARCH PROTOCOL (e.g. Macchiato, Mojito, Croissant)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs font-mono text-[#F1F5F9] placeholder-[#55657E] focus:outline-none tracking-wider uppercase"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded-md text-[#94A3B8] hover:text-[#00F0FF]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Bio Fasting Switch & Total Count HUD */}
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              onClick={() => setFastingOnly(!fastingOnly)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono tracking-wider transition-all border ${
                fastingOnly
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                  : 'bg-[#0B101D] text-[#7E8DA6] border-white/10 hover:border-white/20'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  fastingOnly ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                }`}
              />
              <span>[BIO: FASTING / DAIRY-FREE]</span>
            </button>

            <span className="text-[10px] font-mono text-[#62738E] tracking-widest uppercase">
              // {filteredItems.length} SIGNALS LOADED
            </span>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────
            CATEGORY HORIZONTAL HUD BAR (SWIPEABLE)
        ─────────────────────────────────────────────────────────── */}
        <div className="relative mb-5 -mx-4 px-4 overflow-x-auto scrollbar-none flex items-center gap-2 py-1">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-mono tracking-wider uppercase transition-all border ${
              activeTab === 'ALL'
                ? 'bg-gradient-to-r from-[#00F0FF] to-[#00A3FF] text-[#05070B] font-bold border-[#00F0FF] shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                : 'bg-[#0A0E18] text-[#8696B4] border-white/10 hover:border-[#00F0FF]/40'
            }`}
          >
            [ALL // {items.length}]
          </button>

          {categories.map((cat) => {
            const count = items.filter((i) => i.categoryId === cat.id).length
            const isActive = activeTab === cat.id

            return (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-mono tracking-wider uppercase transition-all border ${
                  isActive
                    ? 'bg-gradient-to-r from-[#00F0FF] to-[#00A3FF] text-[#05070B] font-bold border-[#00F0FF] shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                    : 'bg-[#0A0E18] text-[#8696B4] border-white/10 hover:border-[#00F0FF]/40'
                }`}
              >
                {cat.name} ({count})
              </button>
            )
          })}
        </div>

        {/* ───────────────────────────────────────────────────────────
            MENU ITEMS MATRIX DISPLAY
        ─────────────────────────────────────────────────────────── */}
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl bg-[#090D16]/90 border border-white/10 p-10 text-center space-y-3">
            <Radio className="w-8 h-8 text-[#00F0FF] mx-auto animate-pulse" />
            <h3 className="font-mono text-sm font-bold tracking-wider text-neutral-300 uppercase">
              NO MATCHING SIGNAL DETECTED
            </h3>
            <p className="text-xs text-[#62738E] font-mono max-w-xs mx-auto">
              Query &quot;{searchQuery}&quot; returned 0 items. Reset parameters to scan again.
            </p>
            <button
              onClick={() => {
                setActiveTab('ALL')
                setSearchQuery('')
                setFastingOnly(false)
              }}
              className="mt-2 px-4 py-2 rounded-lg bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40 font-mono text-xs font-bold"
            >
              [RESET PROTOCOL]
            </button>
          </div>
        ) : groupedCategories ? (
          // Grouped Display by Category
          <div className="space-y-6">
            {groupedCategories.map(({ category, items: catItems }) => (
              <section key={category.id} className="space-y-3">
                {/* Category Header Banner */}
                <div className="flex items-center justify-between border-b border-[#00F0FF]/20 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-3.5 bg-[#00F0FF] rounded-sm" />
                    <h2 className="font-mono text-xs font-bold tracking-widest uppercase text-[#F1F5F9]">
                      {category.name}
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono text-[#00F0FF]/70 tracking-widest">
                    // {catItems.length} UNITS
                  </span>
                </div>

                {/* Items in this category */}
                <div className="grid grid-cols-1 gap-2.5">
                  {catItems.map((item, idx) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      index={idx}
                      onSelect={() => setSelectedItem(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          // Flat Display when filtered or searching
          <div className="grid grid-cols-1 gap-2.5">
            {filteredItems.map((item, idx) => (
              <ItemCard
                key={item.id}
                item={item}
                index={idx}
                onSelect={() => setSelectedItem(item)}
              />
            ))}
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────
            FUTURISTIC FOOTER
        ─────────────────────────────────────────────────────────── */}
        <footer className="mt-10 mb-6 pt-6 border-t border-white/5 text-center font-mono text-[10px] text-[#55657E] space-y-1">
          <div className="flex items-center justify-center gap-2 text-[#7988A3]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF]" />
            <span>KOGNA SPECIALTY COFFEE // POINT OF SALE INTERFACE</span>
          </div>
          <p>PRICES IN ETHIOPIAN BIRR (ETB) • TAX INCLUDED • TABLE SERVICE</p>
          <p className="text-[9px] text-[#3E4C63]">ENCRYPTED QR LINK • ZERO AUTH REQUIRED</p>
        </footer>
      </div>

      {/* ───────────────────────────────────────────────────────────
          FUTURISTIC ITEM SPECIFICATION MODAL
      ─────────────────────────────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-sm rounded-2xl bg-[#090D16] border border-[#00F0FF]/40 shadow-[0_0_35px_rgba(0,240,255,0.25)] p-5 font-mono space-y-4">
            {/* Top Bar with Close Button */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-[10px] uppercase tracking-widest text-[#00F0FF] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                <span>SPEC SHEET // {selectedItem.categoryName || 'BEVERAGE'}</span>
              </span>

              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 rounded-lg bg-white/5 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Title & Price Matrix */}
            <div>
              <h3 className="text-lg font-black text-white tracking-wide">
                {selectedItem.name}
              </h3>

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black bg-gradient-to-r from-[#FFB800] to-[#FFA000] bg-clip-text text-transparent">
                  {selectedItem.price.toFixed(0)}
                </span>
                <span className="text-xs text-[#FFB800] font-bold">ETB / BIRR</span>
              </div>
            </div>

            {/* Description / Formula */}
            <div className="p-3 rounded-xl bg-[#05070B] border border-white/5 space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-[#62738E] block">
                COMPOSITION &amp; NOTES
              </span>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                {selectedItem.description ||
                  'Specially calibrated Ethiopian highland roast, extracted under precision pressure and temperature.'}
              </p>
            </div>

            {/* Fasting indicator */}
            {selectedItem.name.toLowerCase().includes('fasting') ||
            (selectedItem.description &&
              selectedItem.description.toLowerCase().includes('fasting')) ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>FASTING CERTIFIED: 100% DAIRY-FREE &amp; PLANT BASED</span>
              </div>
            ) : null}

            {/* Close CTA */}
            <button
              onClick={() => setSelectedItem(null)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#00A3FF] text-[#05070B] text-xs font-black tracking-widest uppercase hover:brightness-110 transition-all"
            >
              [CLOSE SPEC SHEET]
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// INDIVIDUAL ITEM CARD COMPONENT (HUD STYLE)
// ───────────────────────────────────────────────────────────
function ItemCard({
  item,
  index,
  onSelect,
}: {
  item: MenuItemData
  index: number
  onSelect: () => void
}) {
  const isFasting =
    item.name.toLowerCase().includes('fasting') ||
    (item.description && item.description.toLowerCase().includes('dairy-free')) ||
    (item.description && item.description.toLowerCase().includes('fasting'))

  const formattedIndex = String(index + 1).padStart(2, '0')

  return (
    <div
      onClick={onSelect}
      className="group relative rounded-xl bg-[#080C15]/90 border border-[#00F0FF]/20 hover:border-[#00F0FF]/60 active:scale-[0.99] p-3.5 transition-all cursor-pointer backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.4)] hover:shadow-[0_0_18px_rgba(0,240,255,0.12)] flex items-center justify-between gap-3"
    >
      {/* Subtle corner tech accent */}
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00F0FF]/40 rounded-tr-md group-hover:border-[#00F0FF] transition-colors" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00F0FF]/40 rounded-bl-md group-hover:border-[#00F0FF] transition-colors" />

      {/* Left Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[10px] font-mono text-[#55657E]">
            #{formattedIndex}
          </span>
          <h3 className="font-mono text-sm font-bold text-white group-hover:text-[#00F0FF] transition-colors truncate">
            {item.name}
          </h3>
          {isFasting && (
            <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 tracking-wider">
              BIO-FASTING
            </span>
          )}
        </div>

        {item.description && (
          <p className="text-[11px] text-[#8696B4] font-sans line-clamp-1 leading-normal">
            {item.description}
          </p>
        )}
      </div>

      {/* Right Price HUD */}
      <div className="text-right flex-shrink-0 flex items-center gap-2">
        <div>
          <span className="font-mono text-base font-black text-[#FFB800] group-hover:text-[#FFC72C] transition-colors">
            {item.price.toFixed(0)}
          </span>
          <span className="text-[9px] font-mono text-[#FFB800]/70 ml-1">
            ETB
          </span>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-[#55657E] group-hover:text-[#00F0FF] transition-colors" />
      </div>
    </div>
  )
}
