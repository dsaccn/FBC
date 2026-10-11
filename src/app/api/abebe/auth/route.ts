import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAbebeSession, deleteAbebeSession, getSession } from '@/lib/session'
import bcrypt from 'bcryptjs'

// GET: Check standalone session status for /abebe
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ authenticated: false }, { status: 200 })
    }

    // Verify user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, username: true, fullName: true, role: true, active: true },
    })

    if (!user || !user.active || user.role !== 'ADMIN') {
      await deleteAbebeSession()
      return NextResponse.json({ authenticated: false }, { status: 200 })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ authenticated: false, error: error.message }, { status: 500 })
  }
}

// POST: Standalone login to /abebe console
export async function POST(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const userAgent = req.headers.get('user-agent') || 'unknown'
  const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ?? realIp ?? 'unknown'

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      await prisma.loginAttempt.create({
        data: {
          username: 'unknown',
          success: false,
          ipAddress: ip,
          userAgent,
          reason: 'INVALID_PAYLOAD',
          portal: 'ABEBE_CONSOLE',
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { username, password } = body
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      await prisma.loginAttempt.create({
        data: {
          username: typeof username === 'string' ? username.slice(0, 64) : 'unknown',
          success: false,
          ipAddress: ip,
          userAgent,
          reason: 'MISSING_CREDENTIALS',
          portal: 'ABEBE_CONSOLE',
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    const trimmedUsername = username.trim()

    // Find ADMIN user: exact match first, then case-insensitive match
    let user = await prisma.user.findFirst({
      where: {
        role: 'ADMIN',
        OR: [
          { username: trimmedUsername },
          { username: trimmedUsername.toUpperCase() },
          { username: trimmedUsername.toLowerCase() },
        ],
      },
    })

    if (!user || !user.active) {
      const failReason = !user ? 'USER_NOT_FOUND_OR_NOT_ADMIN' : 'ACCOUNT_INACTIVE'
      await prisma.loginAttempt.create({
        data: {
          username: trimmedUsername,
          success: false,
          ipAddress: ip,
          userAgent,
          reason: failReason,
          portal: 'ABEBE_CONSOLE',
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Invalid credentials or account inactive' }, { status: 401 })
    }

    // Check password hash
    let passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      if (await bcrypt.compare(password.toUpperCase(), user.passwordHash)) {
        passwordMatch = true
      } else if (await bcrypt.compare(password.toLowerCase(), user.passwordHash)) {
        passwordMatch = true
      }
    }

    if (!passwordMatch) {
      await prisma.loginAttempt.create({
        data: {
          username: trimmedUsername,
          success: false,
          ipAddress: ip,
          userAgent,
          reason: 'INVALID_PASSWORD',
          portal: 'ABEBE_CONSOLE',
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    // Create standalone Abebe session
    await createAbebeSession({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    })

    // Record successful login attempt
    await prisma.loginAttempt.create({
      data: {
        username: user.username,
        success: true,
        ipAddress: ip,
        userAgent,
        reason: 'SUCCESS',
        portal: 'ABEBE_CONSOLE',
      },
    }).catch(() => {})

    // Record login session history
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        ipAddress: ip,
        userAgent,
        portal: 'ABEBE_CONSOLE',
        status: 'ACTIVE',
      },
    }).catch(() => {})

    // Log login to DevAuditLog
    try {
      await prisma.devAuditLog.create({
        data: {
          developerUsername: user.username,
          action: 'LOGIN',
          targetTable: 'Abebe Console',
          recordId: user.id,
          reason: 'Standalone Developer Flight Control authenticated session established',
          ipAddress: ip,
        },
      })
    } catch {
      // Non-critical audit failure
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    })
  } catch (error: any) {
    console.error('Abebe login error:', error)
    return NextResponse.json({ error: 'Server authentication failure' }, { status: 500 })
  }
}

// DELETE: Standalone logout from /abebe console
export async function DELETE() {
  try {
    const session = await getSession()
    if (session?.id) {
      const activeSession = await prisma.loginHistory.findFirst({
        where: { userId: session.id, status: 'ACTIVE', portal: 'ABEBE_CONSOLE' },
        orderBy: { loginAt: 'desc' },
      })
      if (activeSession) {
        await prisma.loginHistory.update({
          where: { id: activeSession.id },
          data: { status: 'LOGGED_OUT', logoutAt: new Date() },
        }).catch(() => {})
      }
    }
  } catch {}

  await deleteAbebeSession()
  return NextResponse.json({ success: true, message: 'Logged out of standalone console' })
}
