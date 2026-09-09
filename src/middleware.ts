import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_ISSUER = 'nexora-tech-pos'
const JWT_AUDIENCE = 'nexora-pos-client'

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'nexora-tech-pos-super-secure-production-key-2026'
  return new TextEncoder().encode(secret)
}

// UI Page RBAC Map (Most specific prefix matches first)
const pageRoleRoutes: Record<string, string[]> = {
  '/dashboard/staff-meals': ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/staff': ['ADMIN'],
  '/dashboard/menu': ['ADMIN'],
  '/dashboard/reports': ['ADMIN', 'MANAGER'],
  '/dashboard/inventory': ['ADMIN', 'MANAGER'],
  '/dashboard/recipes': ['ADMIN', 'MANAGER'],
  '/dashboard/tables': ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/orders': ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard/payment': ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
  '/dashboard': ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
}

// API Route RBAC Map
const apiRoleRoutes: Record<string, { roles: string[]; methods?: Record<string, string[]> }> = {
  '/api/staff-members': { roles: ['ADMIN', 'MANAGER'] },
  '/api/staff-menu-items': { roles: ['ADMIN', 'MANAGER'] },
  '/api/staff-ingredients': { roles: ['ADMIN', 'MANAGER'] },
  '/api/staff-recipes': { roles: ['ADMIN', 'MANAGER'] },
  '/api/staff': { roles: ['ADMIN'] },
  '/api/menu-items': {
    roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    methods: {
      POST: ['ADMIN'],
      PUT: ['ADMIN'],
      PATCH: ['ADMIN'],
      DELETE: ['ADMIN'],
    },
  },
  '/api/categories': {
    roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    methods: {
      POST: ['ADMIN'],
      PUT: ['ADMIN'],
      PATCH: ['ADMIN'],
      DELETE: ['ADMIN'],
    },
  },
  '/api/recipes': { roles: ['ADMIN', 'MANAGER'] },
  '/api/inventory': { roles: ['ADMIN', 'MANAGER'] },
  '/api/reports': { roles: ['ADMIN', 'MANAGER'] },
  '/api/tables': { roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  '/api/orders': { roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  '/api/payments': { roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  '/api/cancellations': { roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  '/api/staff-meals': { roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
  '/api/sync': { roles: ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'] },
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method

  // 1. Allow public authentication and asset endpoints
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

  const isApi = pathname.startsWith('/api')
  const isDashboard = pathname.startsWith('/dashboard')

  if (!isApi && !isDashboard) {
    return NextResponse.next()
  }

  // 2. Extract and verify session token
  const token = request.cookies.get('session')?.value

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })

    const role = (payload.role as string) || ''

    // 3. Enforce API RBAC
    if (isApi) {
      for (const [routePrefix, rule] of Object.entries(apiRoleRoutes)) {
        if (pathname.startsWith(routePrefix)) {
          // Check HTTP method specific role requirements
          const requiredRoles = rule.methods?.[method] || rule.roles
          if (!requiredRoles.includes(role)) {
            return NextResponse.json(
              { error: 'Forbidden: Insufficient permissions for this operation' },
              { status: 403 }
            )
          }
          break
        }
      }
      return NextResponse.next()
    }

    // 4. Enforce UI Page RBAC
    if (isDashboard) {
      let matchedRoute = ''
      let matchedRoles: string[] = []

      for (const [route, allowedRoles] of Object.entries(pageRoleRoutes)) {
        if (pathname.startsWith(route) && route.length > matchedRoute.length) {
          matchedRoute = route
          matchedRoles = allowedRoles
        }
      }

      if (matchedRoute && !matchedRoles.includes(role)) {
        return NextResponse.redirect(new URL('/dashboard/tables', request.url))
      }
    }

    return NextResponse.next()
  } catch (err) {
    console.warn('[MIDDLEWARE_AUTH_FAILED]', err)
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized: Invalid or expired session' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
