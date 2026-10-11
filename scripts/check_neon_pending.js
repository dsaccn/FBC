const { Pool } = require('pg')
const fs = require('fs')

async function checkNeon() {
  const env = fs.readFileSync('.env', 'utf8')
  const match = env.match(/NEON_DATABASE_URL=['"]?(.*?)['"]?(\r?\n|$)/)
  const neonUrl = match ? match[1] : process.env.NEON_DATABASE_URL

  const pool = new Pool({ connectionString: neonUrl })
  
  const orders = await pool.query('SELECT count(*) FROM "Order" WHERE "pendingSync" = true')
  const items = await pool.query('SELECT count(*) FROM "OrderItem" WHERE "pendingSync" = true')
  const payments = await pool.query('SELECT count(*) FROM "Payment" WHERE "pendingSync" = true')
  const tables = await pool.query('SELECT count(*) FROM "Table" WHERE "pendingSync" = true')

  console.log('NEON Orders pendingSync=true:', orders.rows[0].count)
  console.log('NEON OrderItems pendingSync=true:', items.rows[0].count)
  console.log('NEON Payments pendingSync=true:', payments.rows[0].count)
  console.log('NEON Tables pendingSync=true:', tables.rows[0].count)

  const pendingOrdersList = await pool.query('SELECT id, status, "createdAt" FROM "Order" WHERE "pendingSync" = true')
  console.log('Pending orders list on Neon:', pendingOrdersList.rows)

  const pendingTablesList = await pool.query('SELECT id, number, status FROM "Table" WHERE "pendingSync" = true')
  console.log('Pending tables list on Neon:', pendingTablesList.rows)

  await pool.end()
}

checkNeon().catch(console.error)
