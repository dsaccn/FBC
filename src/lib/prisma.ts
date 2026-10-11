import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // On Vercel, use the pooled Neon URL (DATABASE_URL) for serverless connection pooling
  // Fall back to DATABASE_URL_UNPOOLED or local SQLite DATABASE_URL
  const url = process.env.VERCEL
    ? (process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED)
    : process.env.DATABASE_URL

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(url ? { datasources: { db: { url } } } : {}),
  })
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

