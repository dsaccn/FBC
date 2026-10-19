import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { backgroundSync, pushUserToCloud, clearDeletedUser } from '@/lib/sync-engine'

export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, fullName: true, role: true, phone: true, active: true, createdAt: true },
    orderBy: { fullName: 'asc' },
  })
  return NextResponse.json(users)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const cleanUsername = String(body.username || '').trim().toLowerCase()
    const cleanFullName = String(body.fullName || '').trim()
    const cleanPassword = String(body.password || '').trim()
    const cleanRole = String(body.role || 'WAITER').trim().toUpperCase()
    const cleanPhone = body.phone && String(body.phone).trim() ? String(body.phone).trim() : null

    if (!cleanUsername || !cleanFullName || !cleanPassword) {
      return NextResponse.json(
        { error: 'Full name, username, and password are required.' },
        { status: 400 }
      )
    }

    // Check if username is already taken locally
    const existing = await prisma.user.findFirst({
      where: { username: { equals: cleanUsername } }
    })
    if (existing) {
      return NextResponse.json(
        { error: `Username "${cleanUsername}" is already in use by ${existing.fullName}.` },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 10)

    // Un-tombstone username if it was previously deleted in local file and Neon table
    clearDeletedUser(undefined, cleanUsername)

    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        passwordHash,
        fullName: cleanFullName,
        role: cleanRole,
        phone: cleanPhone,
      },
      select: { id: true, username: true, fullName: true, role: true, phone: true, active: true, createdAt: true },
    })

    clearDeletedUser(user.id, user.username)

    await pushUserToCloud({
      id: user.id,
      username: user.username,
      passwordHash,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      active: user.active,
      createdAt: user.createdAt,
    })

    backgroundSync()

    return NextResponse.json(user)
  } catch (err: any) {
    console.error('[POST /api/staff]', err)
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'This username is already taken. Please choose another.' }, { status: 400 })
    }
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
