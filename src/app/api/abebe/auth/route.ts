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
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { username, password } = body
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
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
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    // Create standalone Abebe session
    await createAbebeSession({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    })

    // Log login to DevAuditLog
    try {
      const forwardedFor = req.headers.get('x-forwarded-for')
      const realIp = req.headers.get('x-real-ip')
      const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ?? realIp ?? 'unknown'

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
  await deleteAbebeSession()
  return NextResponse.json({ success: true, message: 'Logged out of standalone console' })
}
