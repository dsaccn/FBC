'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal component that renders children directly into document.body.
 * This ensures modals always use the viewport as their containing block,
 * regardless of any CSS transforms on parent elements.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(children, document.body)
}
