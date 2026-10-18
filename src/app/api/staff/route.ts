import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { backgroundSync, pushUserToCloud } from '@/lib/sync-engine'

export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, fullName: true, role: true, phone: true, active: true, createdAt: true },
    orderBy: { fullName: 'asc' },
  })
  return NextResponse.json(users)
}

export async function POST(req: Request) {
  try {
    const { username, password, fullName, role, phone } = await req.json()
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { username, passwordHash, fullName, role, phone },
      select: { id: true, username: true, fullName: true, role: true, phone: true, active: true, createdAt: true },
    })

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
  } catch (err) {
    console.error('[POST /api/staff]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
