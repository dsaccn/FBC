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

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Cache on globalThis in all environments so warm serverless instances reuse connection pool
globalForPrisma.prisma = prisma
