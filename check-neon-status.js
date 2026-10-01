const { Client } = require('pg')

const url = 'postgresql://neondb_owner:npg_OqYfFNel19nm@ep-late-base-aeh5dxxq-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require'

async function check() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('✅ Connected to Neon Cloud PostgreSQL!')

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `)
  console.log('\n📊 Tables in Neon Database:')
  tables.rows.forEach(r => console.log('  • ' + r.table_name))

  const users = await client.query('SELECT id, username, "fullName", role, active FROM "User";')
  console.log('\n👥 Users in Neon Database:')
  users.rows.forEach(u => console.log(`  • [${u.role}] ${u.username} (${u.fullName}) - Active: ${u.active}`))

  const orderCount = await client.query('SELECT COUNT(*) FROM "Order";')
  const menuCount = await client.query('SELECT COUNT(*) FROM "MenuItem";')
  const tableCount = await client.query('SELECT COUNT(*) FROM "Table";')

  console.log(`\n📦 Current Cloud Data Counts:`)
  console.log(`  • Tables: ${tableCount.rows[0].count}`)
  console.log(`  • Menu Items: ${menuCount.rows[0].count}`)
  console.log(`  • Orders: ${orderCount.rows[0].count}`)

  await client.end()
}

check().catch(err => {
  console.error('❌ Error connecting to Neon:', err.message)
})
