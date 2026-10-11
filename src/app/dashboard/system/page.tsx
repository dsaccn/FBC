'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SystemRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/abebe')
  }, [router])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: '#64748B', fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#0F172A' }}>
        Redirecting to Standalone Developer Flight Control...
      </div>
      <div style={{ fontSize: '12px', color: '#94A3B8' }}>
        The Developer Portal has moved to dedicated console port <code>/abebe</code>.
      </div>
    </div>
  )
}
