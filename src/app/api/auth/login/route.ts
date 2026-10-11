import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { signToken } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const limiter = rateLimit({ interval: 60_000, limit: 5 })

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const forwardedFor = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const userAgent = req.headers.get('user-agent') || 'unknown'
  const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ?? realIp ?? 'unknown'
  const { success } = limiter.check(ip)

  if (!success) {
    await prisma.loginAttempt.create({
      data: {
        username: 'unknown',
        success: false,
        ipAddress: ip,
        userAgent,
        reason: 'RATE_LIMITED',
        portal: 'POS',
      },
    }).catch(() => {})

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
  const trimmedUsername = typeof username === 'string' ? username.trim() : ''
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
    await prisma.loginAttempt.create({
      data: {
        username: trimmedUsername || 'invalid_input',
        success: false,
        ipAddress: ip,
        userAgent,
        reason: 'INVALID_INPUT',
        portal: 'POS',
      },
    }).catch(() => {})

    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Constant time comparison — prevents timing attacks (with case tolerance)
  let user = await prisma.user.findUnique({ where: { username: trimmedUsername } })
  if (!user) {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: trimmedUsername.toUpperCase() },
          { username: trimmedUsername.toLowerCase() },
        ],
      },
    })
  }

  const targetHash = user?.active ? user.passwordHash : '$2b$10$invalidhashfortimingprotection'
  let passwordMatch = await bcrypt.compare(password, targetHash)
  if (!passwordMatch && user?.active) {
    if (await bcrypt.compare(password.toUpperCase(), targetHash)) {
      passwordMatch = true
    } else if (await bcrypt.compare(password.toLowerCase(), targetHash)) {
      passwordMatch = true
    }
  }

  if (!user || !user.active || !passwordMatch) {
    const failReason = !user ? 'USER_NOT_FOUND' : (!user.active ? 'ACCOUNT_INACTIVE' : 'INVALID_PASSWORD')
    await prisma.loginAttempt.create({
      data: {
        username: trimmedUsername,
        success: false,
        ipAddress: ip,
        userAgent,
        reason: failReason,
        portal: 'POS',
      },
    }).catch(() => {})

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Record successful login attempt
  await prisma.loginAttempt.create({
    data: {
      username: user.username,
      success: true,
      ipAddress: ip,
      userAgent,
      reason: 'SUCCESS',
      portal: 'POS',
    },
  }).catch(() => {})

  // Record in login session history
  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      ipAddress: ip,
      userAgent,
      portal: 'POS',
      status: 'ACTIVE',
    },
  }).catch(() => {})

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
