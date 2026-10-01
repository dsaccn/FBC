import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/session'

const ROLE_ROUTES: Record<string, string[]> = {
  // UI Dashboard Routes
  '/dashboard/delivery':    ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/staff-meals': ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/staff':       ['ADMIN'],
  '/dashboard/menu':        ['ADMIN'],
  '/dashboard/reports':     ['ADMIN', 'MANAGER'],
  '/dashboard/inventory':   ['ADMIN', 'MANAGER'],
  '/dashboard/recipes':     ['ADMIN', 'MANAGER'],
  '/dashboard/tables':      ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/orders':      ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/payment':     ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard':             ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],

  // API Routes
  '/api/verify-receipt':    ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/delivery-orders':   ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/staff-members':     ['ADMIN', 'MANAGER'],
  '/api/staff-menu-items':  ['ADMIN', 'MANAGER'],
  '/api/staff-ingredients': ['ADMIN', 'MANAGER'],
  '/api/staff-recipes':     ['ADMIN', 'MANAGER'],
  '/api/staff':             ['ADMIN'],
  '/api/recipes':           ['ADMIN', 'MANAGER'],
  '/api/inventory':         ['ADMIN', 'MANAGER'],
  '/api/reports':           ['ADMIN', 'MANAGER'],
  '/api/menu-items':        ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/categories':        ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/tables':            ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/orders':            ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/payments':          ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/cancellations':     ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/staff-meals':       ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/sync':              ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api')

  // Block non-GET requests to UI page routes (e.g. scanner sending POST /login instead of /api/auth/login)
  if (pathname === '/login' && req.method !== 'GET' && req.method !== 'HEAD') {
    return NextResponse.json(
      { error: 'Method Not Allowed. Authentication API is at /api/auth/login' },
      { status: 405 }
    )
  }

  // Allow public authentication and static assets
  if (
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Check if route needs protection (find longest matching prefix)
  let protectedPrefix: string | undefined
  let maxLen = 0

  for (const prefix of Object.keys(ROLE_ROUTES)) {
    if (pathname.startsWith(prefix) && prefix.length > maxLen) {
      protectedPrefix = prefix
      maxLen = prefix.length
    }
  }

  if (!protectedPrefix) return NextResponse.next()

  const token = req.cookies.get('session')?.value

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const payload = await verifyToken(token)

  if (!payload) {
    if (isApi) {
      const response = NextResponse.json({ error: 'Unauthorized: Invalid or expired session' }, { status: 401 })
      response.cookies.delete('session')
      return response
    }
    const response = NextResponse.redirect(new URL('/login', req.url))
    response.cookies.delete('session')
    return response
  }

  const allowedRoles = ROLE_ROUTES[protectedPrefix]
  const userRole = String(payload.role || '')

  if (!allowedRoles.includes(userRole)) {
    if (isApi) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/dashboard/tables', req.url))
  }

  // Attach user to headers for server components
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-user-id', String(payload.id || ''))
  requestHeaders.set('x-user-role', userRole)
  requestHeaders.set('x-user-name', String(payload.username || ''))

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
