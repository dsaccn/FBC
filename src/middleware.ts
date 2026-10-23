import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/session'

const ROLE_ROUTES: Record<string, string[]> = {
  // UI Dashboard Routes
  '/dashboard/delivery':    ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/staff-meals': ['ADMIN'],
  '/dashboard/staff':       ['ADMIN'],
  '/dashboard/menu':        ['ADMIN'],
  '/dashboard/reports':     ['ADMIN'],
  '/dashboard/inventory':   ['ADMIN', 'MANAGER'],
  '/dashboard/recipes':     ['ADMIN'],
  '/dashboard/system':      ['ADMIN'],
  '/dashboard/tables':      ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/orders':      ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/payment':     ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard':             ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],

  // API Routes
  '/api/system':            ['ADMIN'],
  '/api/delivery-orders':   ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/staff-members':     ['ADMIN'],
  '/api/staff-menu-items':  ['ADMIN'],
  '/api/staff-ingredients': ['ADMIN'],
  '/api/staff-recipes':     ['ADMIN'],
  '/api/staff':             ['ADMIN'],
  '/api/recipes':           ['ADMIN'],
  '/api/ingredients':       ['ADMIN', 'MANAGER'],
  '/api/inventory':         ['ADMIN', 'MANAGER'],
  '/api/reports':           ['ADMIN'],
  '/api/menu-items':        ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/categories':        ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/tables':            ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/orders':            ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/payments':          ['ADMIN', 'MANAGER', 'CASHIER'],
  '/api/cancellations':     ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/api/staff-meals':       ['ADMIN'],
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

  // Allow public authentication, standalone abebe flight control, scanner verification, and static assets
  if (
    pathname === '/scanner' ||
    pathname === '/api/verify-receipt' ||
    pathname === '/api/system/recover-delivery' ||
    pathname.startsWith('/api/scanner') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/abebe') ||
    pathname === '/login' ||
    pathname === '/abebe' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/.well-known') ||
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

  const token = req.cookies.get('abebe_session')?.value || req.cookies.get('session')?.value

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

  const userRole = String(payload.role || '')

  // Method-specific role hardening for menu & category mutations
  if (
    (pathname.startsWith('/api/menu-items') || pathname.startsWith('/api/categories')) &&
    !['GET', 'HEAD'].includes(req.method)
  ) {
    if (userRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Only administrators can modify menu items or categories' }, { status: 403 })
    }
  }

  // Enforce defined role routes (default-deny for matched prefixes)
  if (protectedPrefix) {
    const allowedRoles = ROLE_ROUTES[protectedPrefix]
    if (!allowedRoles.includes(userRole)) {
      if (isApi) {
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard/tables', req.url))
    }
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
