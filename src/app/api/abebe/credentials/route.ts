import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAbebeSession } from '@/lib/session'
import { getAbebeCredential, verifyAbebePassword, updateAbebeCredential } from '@/lib/abebe-auth'

// GET: Retrieve current standalone management portal profile & cloud status
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 })
    }

    const cred = await getAbebeCredential()
    if (!cred) {
      return NextResponse.json({ error: 'Management credentials not found' }, { status: 404 })
    }

    const neonUrl = process.env.NEON_DATABASE_URL
    let cloudConnected = false

    if (neonUrl) {
      try {
        const { Pool } = await import('pg')
        const pool = new Pool({ connectionString: neonUrl, connectionTimeoutMillis: 4000, ssl: { rejectUnauthorized: false } })
        await pool.query('SELECT 1')
        cloudConnected = true
        await pool.end()
      } catch {
        cloudConnected = false
      }
    }

    return NextResponse.json({
      username: cred.username,
      fullName: 'Management Console',
      role: 'ADMIN',
      createdAt: cred.createdAt,
      cloudConnected,
      hasCloudConfig: !!neonUrl,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Update standalone management portal credentials (NEVER touches POS User table!)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const {
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
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters long for security' }, { status: 400 })
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'New passwords do not match' }, { status: 400 })
    }

    const trimmedNewUsername = newUsername.trim()
    const USERNAME_REGEX = /^[a-zA-Z0-9_.\-@]+$/
    if (!USERNAME_REGEX.test(trimmedNewUsername)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, dots, hyphens, and underscores' }, { status: 400 })
    }

    // 2. Fetch standalone management credentials
    const cred = await getAbebeCredential()
    if (!cred) {
      return NextResponse.json({ error: 'Management credentials record not found' }, { status: 404 })
    }

    // 3. Verify current management password
    const passwordMatch = await verifyAbebePassword(currentPassword, cred.passwordHash)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Current password verification failed' }, { status: 401 })
    }

    // 4. Update standalone credentials in SQLite and Neon Cloud (NEVER touches User table!)
    const updatedCred = await updateAbebeCredential(trimmedNewUsername, newPassword)

    // 5. Refresh Abebe session
    await createAbebeSession({
      id: updatedCred.id,
      username: updatedCred.username,
      fullName: 'Management Console',
      role: 'ADMIN',
    })

    // 6. Record audit log
    const forwardedFor = req.headers.get('x-forwarded-for')
    const realIp = req.headers.get('x-real-ip')
    const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ?? realIp ?? 'unknown'

    try {
      await prisma.devAuditLog.create({
        data: {
          developerUsername: trimmedNewUsername,
          action: 'UPDATE_STANDALONE_CREDENTIALS',
          targetTable: 'AbebeCredential',
          recordId: updatedCred.id,
          previousState: JSON.stringify({ username: cred.username }),
          newState: JSON.stringify({ username: trimmedNewUsername, updated: true }),
          reason: 'Updated management portal master credentials (Standalone decoupled)',
          ipAddress: ip,
        },
      })
    } catch {
      // Non-critical audit failure
    }

    return NextResponse.json({
      success: true,
      message: 'Management portal credentials updated successfully (Standalone)',
      username: updatedCred.username,
    })
  } catch (error: any) {
    console.error('Update management credentials error:', error)
    return NextResponse.json({ error: error.message || 'Failed to update credentials' }, { status: 500 })
  }
}
