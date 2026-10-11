import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { logDevAction } from '@/lib/dev-audit'

export const dynamic = 'force-dynamic'

function getFileSizeBytes(filePath: string): number {
  try {
    if (fs.existsSync(filePath)) {
      return fs.statSync(filePath).size
    }
  } catch { /* ignore */ }
  return 0
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export async function GET() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // 1. SQLite database disk metrics
    const dbPath = path.join(process.cwd(), 'prisma', 'diva-addis.db')
    const walPath = path.join(process.cwd(), 'prisma', 'diva-addis.db-wal')
    const shmPath = path.join(process.cwd(), 'prisma', 'diva-addis.db-shm')

    const dbSize = getFileSizeBytes(dbPath)
    const walSize = getFileSizeBytes(walPath)
    const shmSize = getFileSizeBytes(shmPath)
    const totalDbSize = dbSize + walSize + shmSize

    // Query SQLite PRAGMA journal_mode
    let journalMode = 'unknown'
    try {
      const modeResult: any = await prisma.$queryRawUnsafe('PRAGMA journal_mode')
      if (Array.isArray(modeResult) && modeResult[0]) {
        journalMode = modeResult[0].journal_mode || String(Object.values(modeResult[0])[0])
      }
    } catch { /* ignore */ }

    // 2. Process & Server resource footprint
    const memory = process.memoryUsage()
    const uptimeSec = Math.floor(process.uptime())

    return NextResponse.json({
      database: {
        engine: 'SQLite 3 (via Prisma ORM)',
        journalMode,
        mainFile: { path: 'prisma/diva-addis.db', bytes: dbSize, formatted: formatBytes(dbSize) },
        walFile: { path: 'prisma/diva-addis.db-wal', bytes: walSize, formatted: formatBytes(walSize) },
        shmFile: { path: 'prisma/diva-addis.db-shm', bytes: shmSize, formatted: formatBytes(shmSize) },
        totalDiskUsage: formatBytes(totalDbSize),
      },
      system: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        uptimeSeconds: uptimeSec,
        uptimeFormatted: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
        memoryRss: formatBytes(memory.rss),
        heapUsed: formatBytes(memory.heapUsed),
        heapTotal: formatBytes(memory.heapTotal),
        freeMem: formatBytes(os.freemem()),
        totalMem: formatBytes(os.totalmem()),
      },
    })
  } catch (err: any) {
    console.error('[GET /api/system/health]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Run WAL checkpoint truncate on SQLite
    const checkpointResult = await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
    
    await logDevAction({
      action: 'SQL_QUERY',
      targetTable: 'diva-addis.db',
      reason: 'Executed PRAGMA wal_checkpoint(TRUNCATE) to flush WAL and reclaim disk',
    })

    return NextResponse.json({
      success: true,
      message: 'SQLite WAL checkpoint completed successfully',
      result: checkpointResult,
    })
  } catch (err: any) {
    console.error('[POST /api/system/health]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
