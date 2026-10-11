import { NextResponse } from 'next/server'
import { deleteSession, getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await getSession()
    if (session?.id) {
      const activeSession = await prisma.loginHistory.findFirst({
        where: { userId: session.id, status: 'ACTIVE', portal: 'POS' },
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

  await deleteSession()
  return NextResponse.json({ success: true })
}

