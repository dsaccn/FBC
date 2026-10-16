const fs = require('fs')
const { PrismaClient } = require('@prisma/client')
const { Client } = require('pg')

if (fs.existsSync('.env')) {
  fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
  })
}

const prisma = new PrismaClient()

async function main() {
  console.log('1. Checking SQLite Order table...')
  const cols = await prisma.$queryRawUnsafe("PRAGMA table_info('Order')")
  const existingColNames = new Set(cols.map(c => c.name))

  const newCols = [
    { name: 'verifiedRef', type: 'TEXT' },
    { name: 'verifiedProvider', type: 'TEXT' },
    { name: 'verifiedAmount', type: 'REAL' },
    { name: 'verifiedPayer', type: 'TEXT' },
    { name: 'verifiedReceiver', type: 'TEXT' },
    { name: 'verifiedAt', type: 'DATETIME' },
  ]

  for (const col of newCols) {
    if (!existingColNames.has(col.name)) {
      console.log(`Adding ${col.name} column to SQLite Order...`)
      await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN "${col.name}" ${col.type}`)
      console.log(`SQLite: Added ${col.name}`)
    } else {
      console.log(`SQLite: ${col.name} already exists.`)
    }
  }

  if (process.env.NEON_DATABASE_URL) {
    console.log('\n2. Checking Neon Cloud PostgreSQL Order table...')
    const pg = new Client({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
    try {
      await pg.connect()
      await pg.query(`
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "verifiedRef" TEXT;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "verifiedProvider" TEXT;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "verifiedAmount" DOUBLE PRECISION;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "verifiedPayer" TEXT;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "verifiedReceiver" TEXT;
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP;
      `)
      console.log('Neon: Successfully ensured verification columns exist on Order table!')
      await pg.end()
    } catch (err) {
      console.warn('Neon check skipped or offline:', err.message)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
