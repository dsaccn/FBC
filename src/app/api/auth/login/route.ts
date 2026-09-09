import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { signToken } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const limiter = rateLimit({ interval: 60_000, limit: 5 })

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const forwardedFor = req.headers.get('x-forwarded-for')
  const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ?? req.ip ?? 'unknown'
  const { success } = limiter.check(ip)

  if (!success) {
    return NextResponse.json(
      { error: 'Too many login attempts. Try again in 1 minute.' },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { username, password } = body

  // Input validation & sanitization
  const trimmedUsername = username.trim()
  const USERNAME_REGEX = /^[a-zA-Z0-9_.\-@]+$/

  if (
    !trimmedUsername ||
    !password ||
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    trimmedUsername.length > 64 ||
    password.length > 128 ||
    !USERNAME_REGEX.test(trimmedUsername)
  ) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Constant time comparison — prevents timing attacks
  const user = await prisma.user.findUnique({ where: { username: trimmedUsername } })

  const targetHash = user?.active ? user.passwordHash : '$2b$10$invalidhashfortimingprotection'
  const passwordMatch = await bcrypt.compare(password, targetHash)

  if (!user || !user.active || !passwordMatch) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await signToken({
    id: user.id,
    role: user.role,
    username: user.username,
    fullName: user.fullName,
  })

  const response = NextResponse.json({
    success: true,
    role: user.role,
    fullName: user.fullName,
  })

  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12, // 12 hours
    path: '/',
  })

  return response
}
