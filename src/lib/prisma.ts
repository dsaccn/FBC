import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // On Vercel, use the pooled Neon URL with pgbouncer params for serverless
  // On local, DATABASE_URL is the SQLite file path set in .env
  const url = process.env.VERCEL
    ? (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)
    : process.env.DATABASE_URL

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(url ? { datasources: { db: { url } } } : {}),
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
