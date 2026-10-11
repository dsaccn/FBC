'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AbebeLoginRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/abebe')
  }, [router])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
      background: '#090D16', color: '#64748B', fontFamily: "'Inter', sans-serif"
    }}>
      Loading Developer Login Console (/abebe)...
    </div>
  )
}
