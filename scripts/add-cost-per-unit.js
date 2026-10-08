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
  console.log('1. Checking SQLite Ingredient table...')
  const cols = await prisma.$queryRawUnsafe("PRAGMA table_info('Ingredient')")
  const exists = cols.some(c => c.name === 'costPerUnit')
  if (!exists) {
    console.log('Adding costPerUnit column to SQLite Ingredient...')
    await prisma.$executeRawUnsafe('ALTER TABLE "Ingredient" ADD COLUMN "costPerUnit" REAL NOT NULL DEFAULT 0')
    console.log('SQLite: Successfully added costPerUnit!')
  } else {
    console.log('SQLite: costPerUnit already exists.')
  }

  if (process.env.NEON_DATABASE_URL) {
    console.log('\n2. Checking Neon Cloud PostgreSQL Ingredient table...')
    const pg = new Client({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
    try {
      await pg.connect()
      await pg.query('ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "costPerUnit" DOUBLE PRECISION DEFAULT 0;')
      console.log('Neon: Successfully ensured costPerUnit column exists!')
      await pg.end()
    } catch (err) {
      console.warn('Neon check skipped or offline:', err.message)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
