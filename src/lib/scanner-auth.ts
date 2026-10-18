import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/session'

export const SCANNER_SECRET = process.env.SCANNER_SECRET || 'kogna_scanner_secure_2026'

/**
 * Check if the request is authorized to interact with the scanner APIs
 * Accepts:
 * 1. An active POS user session (Admin, Cashier, Waiter, Manager)
 * 2. A silent scanner secret token (via cookie `scanner_token` or header `x-scanner-token` or query `?key=`)
 */
export async function isScannerAuthorized(req: Request | NextRequest): Promise<boolean> {
  // 0. Requests from local POS machine (localhost / 127.0.0.1) are inherently authorized
  const host = req.headers.get('host') || ''
  if (host.startsWith('localhost:') || host.startsWith('127.0.0.1:') || host === 'localhost' || host === '127.0.0.1') {
    return true
  }

  // 1. Check POS session cookie
  const cookieHeader = req.headers.get('cookie') || ''
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)(?:session|abebe_session)=([^;]+)/)
  if (sessionMatch) {
    const token = sessionMatch[1]
    const payload = await verifyToken(token)
    if (payload && payload.role) {
      return true
    }
  }

  // 2. Check header or query key
  const headerToken = req.headers.get('x-scanner-token')
  if (headerToken && headerToken === SCANNER_SECRET) {
    return true
  }

  // 3. Check cookie `scanner_token`
  const scannerCookieMatch = cookieHeader.match(/(?:^|;\s*)scanner_token=([^;]+)/)
  if (scannerCookieMatch && scannerCookieMatch[1] === SCANNER_SECRET) {
    return true
  }

  // 4. Check URL search param (?key= or ?scanner_token=)
  try {
    const url = new URL(req.url)
    const queryKey = url.searchParams.get('key') || url.searchParams.get('scanner_token')
    if (queryKey && queryKey === SCANNER_SECRET) {
      return true
    }
  } catch {}

  return false
}
