import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAbebeSession } from '@/lib/session'
import bcrypt from 'bcryptjs'

// GET: Retrieve current administrator account profile & cloud status
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 })
    }

    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
        createdAt: true,
      },
    })

    if (!admin) {
      return NextResponse.json({ error: 'Admin account not found' }, { status: 404 })
    }

    const neonUrl = process.env.NEON_DATABASE_URL
    let cloudConnected = false

    if (neonUrl) {
      try {
        const { Pool } = require('pg')
        const pool = new Pool({ connectionString: neonUrl, connectionTimeoutMillis: 4000 })
        await pool.query('SELECT 1')
        cloudConnected = true
        await pool.end()
      } catch {
        cloudConnected = false
      }
    }

    return NextResponse.json({
      username: admin.username,
      fullName: admin.fullName,
      role: admin.role,
      createdAt: admin.createdAt,
      cloudConnected,
      hasCloudConfig: !!neonUrl,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Update standalone administrator credentials (username & password)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const {
      currentUsername,
      currentPassword,
      newUsername,
      newPassword,
      confirmPassword,
    } = body

    // 1. Validate required fields
    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json({ error: 'Current password is required to authorize changes' }, { status: 400 })
    }
    if (!newUsername || typeof newUsername !== 'string' || newUsername.trim().length < 2) {
      return NextResponse.json({ error: 'New username must be at least 2 characters long' }, { status: 400 })
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 3) {
      return NextResponse.json({ error: 'New password must be at least 3 characters long' }, { status: 400 })
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'New passwords do not match' }, { status: 400 })
    }

    const trimmedNewUsername = newUsername.trim()
    const USERNAME_REGEX = /^[a-zA-Z0-9_.\-@]+$/
    if (!USERNAME_REGEX.test(trimmedNewUsername)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, dots, hyphens, and underscores' }, { status: 400 })
    }

    // 2. Identify the target admin account
    const session = await getSession()
    let admin = null

    if (session && session.role === 'ADMIN') {
      admin = await prisma.user.findUnique({ where: { id: session.id } })
    }

    if (!admin) {
      // Find admin by provided currentUsername or default to active ADMIN role
      const lookupUser = currentUsername?.trim()
      if (lookupUser) {
        admin = await prisma.user.findFirst({
          where: {
            role: 'ADMIN',
            OR: [
              { username: lookupUser },
              { username: lookupUser.toUpperCase() },
              { username: lookupUser.toLowerCase() },
            ],
          },
        })
      } else {
        admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
      }
    }

    if (!admin) {
      return NextResponse.json({ error: 'Administrator account not found' }, { status: 404 })
    }

    // 3. Verify current password
    let passwordMatch = await bcrypt.compare(currentPassword, admin.passwordHash)
    if (!passwordMatch) {
      if (await bcrypt.compare(currentPassword.toUpperCase(), admin.passwordHash)) {
        passwordMatch = true
      } else if (await bcrypt.compare(currentPassword.toLowerCase(), admin.passwordHash)) {
        passwordMatch = true
      }
    }

    if (!passwordMatch) {
      return NextResponse.json({ error: 'Current password verification failed' }, { status: 401 })
    }

    // 4. Check if new username collides with an existing OTHER user
    const existingConflict = await prisma.user.findFirst({
      where: {
        username: trimmedNewUsername,
        id: { not: admin.id },
      },
    })
    if (existingConflict) {
      return NextResponse.json({ error: `Username "${trimmedNewUsername}" is already taken by another user` }, { status: 409 })
    }

    // 5. Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10)

    // 6. Update local SQLite database
    const previousUsername = admin.username
    const updatedAdmin = await prisma.user.update({
      where: { id: admin.id },
      data: {
        username: trimmedNewUsername,
        fullName: trimmedNewUsername,
        passwordHash: newPasswordHash,
      },
    })

    // 7. Update remote Neon PostgreSQL database if configured
    let cloudUpdated = false
    let cloudError = null
    const neonUrl = process.env.NEON_DATABASE_URL

    if (neonUrl) {
      try {
        const { Pool } = require('pg')
        const pool = new Pool({ connectionString: neonUrl, connectionTimeoutMillis: 6000 })
        await pool.query(
          `UPDATE "User"
           SET username = $1, "fullName" = $2, "passwordHash" = $3
           WHERE id = $4 OR role = 'ADMIN' OR username = $5`,
          [trimmedNewUsername, trimmedNewUsername, newPasswordHash, admin.id, previousUsername]
        )
        await pool.end()
        cloudUpdated = true
      } catch (err: any) {
        console.error('Neon cloud credentials update error:', err)
        cloudError = err.message
      }
    }

    // 8. Record audit log
    const forwardedFor = req.headers.get('x-forwarded-for')
    const realIp = req.headers.get('x-real-ip')
    const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ?? realIp ?? 'unknown'

    try {
      await prisma.devAuditLog.create({
        data: {
          developerUsername: trimmedNewUsername,
          action: 'UPDATE',
          targetTable: 'Admin Credentials',
          recordId: updatedAdmin.id,
          reason: `Master credentials changed. Previous username: "${previousUsername}" -> New username: "${trimmedNewUsername}"`,
          previousState: JSON.stringify({ username: previousUsername }),
          newState: JSON.stringify({
            username: trimmedNewUsername,
            passwordUpdated: true,
            cloudUpdated,
            cloudError,
          }),
          ipAddress: ip,
        },
      })
    } catch {
      // Non-critical audit failure
    }

    // 9. Re-issue standalone session cookie with the new credentials
    await createAbebeSession({
      id: updatedAdmin.id,
      username: updatedAdmin.username,
      fullName: updatedAdmin.fullName,
      role: updatedAdmin.role,
    })

    return NextResponse.json({
      success: true,
      message: cloudUpdated
        ? `Credentials updated in both Local SQLite and Neon Cloud databases.`
        : `Credentials updated in Local SQLite database.`,
      user: {
        id: updatedAdmin.id,
        username: updatedAdmin.username,
        role: updatedAdmin.role,
      },
      cloudUpdated,
    })
  } catch (error: any) {
    console.error('Error updating credentials:', error)
    return NextResponse.json({ error: error.message || 'Failed to update credentials' }, { status: 500 })
  }
}
