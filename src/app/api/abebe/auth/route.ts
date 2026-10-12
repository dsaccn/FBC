import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAbebeSession, deleteAbebeSession, getSession } from '@/lib/session'
import { getAbebeCredential, verifyAbebePassword } from '@/lib/abebe-auth'

// GET: Check standalone session status for /abebe
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ authenticated: false }, { status: 200 })
    }

    const cred = await getAbebeCredential()
    if (!cred) {
      await deleteAbebeSession()
      return NextResponse.json({ authenticated: false }, { status: 200 })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: cred.id,
        username: cred.username,
        fullName: 'Management Console',
        role: 'ADMIN',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ authenticated: false, error: error.message }, { status: 500 })
  }
}

// POST: Standalone login to /abebe console (completely independent of POS user accounts)
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

    // Query standalone Management Portal credentials (independent of POS User table)
    const cred = await getAbebeCredential()
    if (!cred) {
      return NextResponse.json({ error: 'Management credentials uninitialized' }, { status: 500 })
    }

    const usernameMatches =
      cred.username.toLowerCase() === trimmedUsername.toLowerCase() ||
      cred.username === trimmedUsername

    if (!usernameMatches) {
      await prisma.loginAttempt.create({
        data: {
          username: trimmedUsername,
          success: false,
          ipAddress: ip,
          userAgent,
          reason: 'USER_NOT_FOUND',
          portal: 'ABEBE_CONSOLE',
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Invalid management console credentials' }, { status: 401 })
    }

    const passwordMatch = await verifyAbebePassword(password, cred.passwordHash)

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
      id: cred.id,
      username: cred.username,
      fullName: 'Management Console',
      role: 'ADMIN',
    })

    // Record successful login attempt
    await prisma.loginAttempt.create({
      data: {
        username: cred.username,
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
        userId: cred.id,
        username: cred.username,
        fullName: 'Management Console',
        role: 'ADMIN',
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
          developerUsername: cred.username,
          action: 'LOGIN',
          targetTable: 'Abebe Console',
          recordId: cred.id,
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
        id: cred.id,
        username: cred.username,
        fullName: 'Management Console',
        role: 'ADMIN',
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
