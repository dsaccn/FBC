import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/session'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'
import bcrypt from 'bcryptjs'

// Precomputed dummy hash for timing attack mitigation on unknown usernames
const DUMMY_HASH = '$2a$10$e7VjH2y8rC7rYI4JtX0X5.b0D6Yh6y2UfW7D4s8h9q0r1t2u3v4w5'

export async function POST(request: Request) {
  try {
    // 1. Rate Limiting: Max 5 attempts per 15 minutes per IP
    const clientIp = getClientIp(request)
    const rateLimit = checkRateLimit(`login:${clientIp}`, {
      windowMs: 15 * 60 * 1000,
      max: 5,
    })

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: `Too many login attempts. Please try again in ${rateLimit.resetInSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.resetInSeconds),
          },
        }
      )
    }

    // 2. Parse and sanitize input
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
    }

    const rawUsername = typeof body.username === 'string' ? body.username.trim() : ''
    const rawPassword = typeof body.password === 'string' ? body.password : ''

    if (!rawUsername || !rawPassword) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    if (rawUsername.length > 64 || rawPassword.length > 128) {
      return NextResponse.json({ error: 'Input exceeds maximum allowed length' }, { status: 400 })
    }

    // 3. User lookup
    const user = await prisma.user.findUnique({
      where: { username: rawUsername },
    })

    // 4. Timing-attack resistant credential check
    const targetHash = user?.active ? user.passwordHash : DUMMY_HASH
    const valid = await bcrypt.compare(rawPassword, targetHash)

    if (!user || !user.active || !valid) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // 5. Create secure session cookie
    await createSession({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    })

    return NextResponse.json({
      success: true,
      role: user.role,
      fullName: user.fullName,
    })
  } catch (err) {
    console.error('[AUTH_LOGIN_ERROR]', err)
    return NextResponse.json({ error: 'An unexpected authentication error occurred' }, { status: 500 })
  }
}
