/**
 * fix-neon-tables.js
 * One-time script: connects to Neon (cloud PostgreSQL) and fixes all stuck tables
 * by checking each table against real open orders.
 *
 * Run: node fix-neon-tables.js
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

// Manually load .env without needing dotenv package
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const match = line.match(/^([^#=\s]+)\s*=\s*"?(.+?)"?\s*$/)
    if (match) process.env[match[1]] = match[2]
  })
}

async function main() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) {
    console.error('❌ NEON_DATABASE_URL not set in .env')
    process.exit(1)
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  console.log('✅ Connected to Neon cloud database\n')

  // Get all tables that are not FREE
  const { rows: stuckTables } = await client.query(
    `SELECT * FROM "Table" WHERE status != 'FREE'`
  )
  console.log(`Found ${stuckTables.length} non-free table(s) on cloud database`)

  let fixed = 0
  for (const table of stuckTables) {
    // Check if there is an open order for this table on the cloud
    const { rows: openOrders } = await client.query(
      `SELECT id FROM "Order" WHERE "tableId" = $1 AND status = 'OPEN' LIMIT 1`,
      [table.id]
    )

    if (openOrders.length === 0) {
      // No open order — table is stuck, reset to FREE
      await client.query(
        `UPDATE "Table" SET status = 'FREE' WHERE id = $1`,
        [table.id]
      )
      console.log(`  ✓ Table ${table.number} (${table.status}) → FREE`)
      fixed++
    } else {
      console.log(`  — Table ${table.number} is genuinely ${table.status} (has open order)`)
    }
  }

  if (fixed === 0 && stuckTables.length > 0) {
    console.log('\n✅ All occupied tables have genuine open orders — no changes needed.')
  } else if (fixed === 0) {
    console.log('\n✅ All tables are already FREE.')
  } else {
    console.log(`\n✅ Fixed ${fixed} stuck table(s). Refresh the online floor map to verify.`)
  }

  await client.end()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
