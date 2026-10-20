import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  sqliteHealed: boolean | undefined
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

  // On local SQLite, ensure WAL mode, 5000ms busy_timeout, and auto-heal missing schema columns
  if (!process.env.VERCEL) {
    healSqliteSchema(client)
  }

  return client
}

async function healSqliteSchema(client: PrismaClient) {
  if (process.env.VERCEL || globalForPrisma.sqliteHealed) return
  globalForPrisma.sqliteHealed = true

  try {
    await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {})
    await client.$queryRawUnsafe('PRAGMA busy_timeout = 5000;').catch(() => {})

    // 1. Check and heal Ingredient columns (barQuantity, costPerUnit)
    const ingCols = (await client.$queryRawUnsafe<any[]>('PRAGMA table_info("Ingredient");')) || []
    const ingColNames = new Set(ingCols.map((c: any) => c.name))
    if (!ingColNames.has('barQuantity')) {
      await client.$queryRawUnsafe('ALTER TABLE "Ingredient" ADD COLUMN "barQuantity" REAL NOT NULL DEFAULT 0;')
      console.log('[SQLite Auto-Heal] Added barQuantity to Ingredient table')
    }
    if (!ingColNames.has('costPerUnit')) {
      await client.$queryRawUnsafe('ALTER TABLE "Ingredient" ADD COLUMN "costPerUnit" REAL NOT NULL DEFAULT 0;')
      console.log('[SQLite Auto-Heal] Added costPerUnit to Ingredient table')
    }

    // 2. Check and heal MenuItem columns (barQuantity, costPrice, parentItemId, unitMultiplier)
    const menuCols = (await client.$queryRawUnsafe<any[]>('PRAGMA table_info("MenuItem");')) || []
    const menuColNames = new Set(menuCols.map((c: any) => c.name))
    if (!menuColNames.has('barQuantity')) {
      await client.$queryRawUnsafe('ALTER TABLE "MenuItem" ADD COLUMN "barQuantity" INTEGER NOT NULL DEFAULT 0;')
      console.log('[SQLite Auto-Heal] Added barQuantity to MenuItem table')
    }
    if (!menuColNames.has('costPrice')) {
      await client.$queryRawUnsafe('ALTER TABLE "MenuItem" ADD COLUMN "costPrice" REAL NOT NULL DEFAULT 0;')
      console.log('[SQLite Auto-Heal] Added costPrice to MenuItem table')
    }
    if (!menuColNames.has('parentItemId')) {
      await client.$queryRawUnsafe('ALTER TABLE "MenuItem" ADD COLUMN "parentItemId" TEXT;')
      console.log('[SQLite Auto-Heal] Added parentItemId to MenuItem table')
    }
    if (!menuColNames.has('unitMultiplier')) {
      await client.$queryRawUnsafe('ALTER TABLE "MenuItem" ADD COLUMN "unitMultiplier" REAL NOT NULL DEFAULT 1;')
      console.log('[SQLite Auto-Heal] Added unitMultiplier to MenuItem table')
    }

    // 3. Check and heal Order columns (verifiedRef, verifiedProvider, etc.)
    const orderCols = (await client.$queryRawUnsafe<any[]>('PRAGMA table_info("Order");')) || []
    const orderColNames = new Set(orderCols.map((c: any) => c.name))
    const orderFields: [string, string][] = [
      ['verifiedRef', 'TEXT'],
      ['verifiedProvider', 'TEXT'],
      ['verifiedAmount', 'REAL'],
      ['verifiedPayer', 'TEXT'],
      ['verifiedReceiver', 'TEXT'],
      ['verifiedAt', 'DATETIME'],
    ]
    for (const [col, colType] of orderFields) {
      if (!orderColNames.has(col)) {
        await client.$queryRawUnsafe(`ALTER TABLE "Order" ADD COLUMN "${col}" ${colType};`)
        console.log(`[SQLite Auto-Heal] Added ${col} to Order table`)
      }
    }

    // 4. Check and heal Table columns (mergedWithId, mergeGroupId, mergeGroupLabel)
    const tableCols = (await client.$queryRawUnsafe<any[]>('PRAGMA table_info("Table");')) || []
    const tableColNames = new Set(tableCols.map((c: any) => c.name))
    if (!tableColNames.has('mergedWithId')) {
      await client.$queryRawUnsafe('ALTER TABLE "Table" ADD COLUMN "mergedWithId" TEXT;')
    }
    if (!tableColNames.has('mergeGroupId')) {
      await client.$queryRawUnsafe('ALTER TABLE "Table" ADD COLUMN "mergeGroupId" TEXT;')
    }
    if (!tableColNames.has('mergeGroupLabel')) {
      await client.$queryRawUnsafe('ALTER TABLE "Table" ADD COLUMN "mergeGroupLabel" TEXT;')
    }

    // 5. Ensure auxiliary tables exist
    await client.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DeletedUser" (
        "id" TEXT,
        "username" TEXT PRIMARY KEY,
        "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {})

    await client.$queryRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "key" TEXT PRIMARY KEY,
        "value" TEXT NOT NULL,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {})
  } catch (err) {
    console.warn('[SQLite Auto-Heal Warning]:', err)
  }
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


