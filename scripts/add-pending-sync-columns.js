/**
 * add-pending-sync-columns.js
 * One-time migration: adds pendingSync & syncedAt columns to Neon if they don't exist.
 * Run: node add-pending-sync-columns.js
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

// Load .env manually
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=')
    if (key && val.length) {
      process.env[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '')
    }
  })
}

const url = process.env.NEON_DATABASE_URL
if (!url) { console.error('NEON_DATABASE_URL not set'); process.exit(1) }

async function run() {
  const client = new Client({ connectionString: url })
  await client.connect()
  console.log('Connected to Neon ✓')

  const migrations = [
    // Order
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pendingSync" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP`,
    // OrderItem
    `ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "pendingSync" BOOLEAN NOT NULL DEFAULT false`,
    // Payment
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "pendingSync" BOOLEAN NOT NULL DEFAULT false`,
    // Cancellation
    `ALTER TABLE "Cancellation" ADD COLUMN IF NOT EXISTS "pendingSync" BOOLEAN NOT NULL DEFAULT false`,
  ]

  for (const sql of migrations) {
    try {
      await client.query(sql)
      console.log('✓', sql.substring(0, 60) + '…')
    } catch (e) {
      console.error('✗', sql.substring(0, 60), '\n ', e.message)
    }
  }

  await client.end()
  console.log('\nDone. All columns are in place.')
}

run().catch(e => { console.error(e); process.exit(1) })
