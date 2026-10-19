import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // On Vercel, use the pooled Neon URL (DATABASE_URL) for serverless connection pooling
  // Fall back to DATABASE_URL_UNPOOLED or local SQLite DATABASE_URL
  let url = process.env.VERCEL
    ? (process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED)
    : process.env.DATABASE_URL

  // On Vercel (Neon serverless), ensure connect_timeout is at least 15s to absorb cold start resumes
  if (process.env.VERCEL && url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    if (!url.includes('connect_timeout=')) {
      url += (url.includes('?') ? '&' : '?') + 'connect_timeout=15&pool_timeout=15'
    }
  }

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(url ? { datasources: { db: { url } } } : {}),
  })

  // On local SQLite, ensure WAL mode and 5000ms busy_timeout so background file locks never cause 'readonly database' errors
  if (!process.env.VERCEL) {
    client.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {})
    client.$queryRawUnsafe('PRAGMA busy_timeout = 5000;').catch(() => {})
  }

  return client
}

function getPrismaInstance(): PrismaClient {
  if (globalForPrisma.prisma && (globalForPrisma.prisma as any).wasteLog) {
    return globalForPrisma.prisma
  }
  const newClient = createPrismaClient()
  globalForPrisma.prisma = newClient
  return newClient
}

export const prisma = getPrismaInstance()

