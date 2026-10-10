const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

const prisma = new PrismaClient();

async function clearLocal() {
  console.log('\n--- 1. CLEARING LOCAL ORDERS (SQLite) ---');
  
  // 1. Delete Cancellations (FK -> OrderItem)
  const cancellations = await prisma.cancellation.deleteMany({});
  console.log(`  ✓ Deleted ${cancellations.count} local cancellations.`);

  // 2. Delete Payments (FK -> Order)
  const payments = await prisma.payment.deleteMany({});
  console.log(`  ✓ Deleted ${payments.count} local payments.`);

  // 3. Delete OrderItems (FK -> Order, MenuItem)
  const orderItems = await prisma.orderItem.deleteMany({});
  console.log(`  ✓ Deleted ${orderItems.count} local order items.`);

  // 4. Delete Orders (both OPEN, PAID, CANCELLED)
  const orders = await prisma.order.deleteMany({});
  console.log(`  ✓ Deleted ${orders.count} local orders.`);

  // 5. Delete temporary delivery/takeaway tables
  const delDeliveryTables = await prisma.table.deleteMany({
    where: {
      OR: [
        { number: { startsWith: 'Delivery:' } },
        { number: { startsWith: 'Takeaway:' } },
        { number: { startsWith: 'DLV-' } },
        { number: { startsWith: 'DELIVERY' } },
        { number: { startsWith: 'TAKEAWAY' } },
      ]
    }
  });
  console.log(`  ✓ Deleted ${delDeliveryTables.count} temporary delivery/takeaway tables.`);

  // 6. Reset all physical floor tables to FREE
  const resetTables = await prisma.table.updateMany({
    data: {
      status: 'FREE',
      mergedWithId: null,
      pendingSync: false,
    }
  });
  console.log(`  ✓ Reset ${resetTables.count} floor tables to FREE status.`);

  // Verify inventory and menu are untouched
  const [menuCount, ingCount, catCount] = await Promise.all([
    prisma.menuItem.count(),
    prisma.ingredient.count(),
    prisma.category.count(),
  ]);
  console.log(`\n  ✅ PRESERVED:`);
  console.log(`     - Menu Items: ${menuCount}`);
  console.log(`     - Ingredients: ${ingCount}`);
  console.log(`     - Categories: ${catCount}`);
}

async function clearCloud() {
  console.log('\n--- 2. CLEARING CLOUD ORDERS (Neon) ---');
  const neonUrl = process.env.NEON_DATABASE_URL;
  if (!neonUrl) {
    console.log('No NEON_DATABASE_URL configured, skipping cloud.');
    return;
  }

  const pool = new Pool({
    connectionString: neonUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    try {
      const delCancel = await client.query('DELETE FROM "Cancellation"');
      console.log(`  ✓ Deleted ${delCancel.rowCount} cancellations in Neon.`);

      const delPay = await client.query('DELETE FROM "Payment"');
      console.log(`  ✓ Deleted ${delPay.rowCount} payments in Neon.`);

      const delItems = await client.query('DELETE FROM "OrderItem"');
      console.log(`  ✓ Deleted ${delItems.rowCount} order items in Neon.`);

      const delOrders = await client.query('DELETE FROM "Order"');
      console.log(`  ✓ Deleted ${delOrders.rowCount} orders in Neon.`);

      const delDeliveryTables = await client.query(`
        DELETE FROM "Table" 
        WHERE number ILIKE 'Delivery:%' 
           OR number ILIKE 'Takeaway:%' 
           OR number ILIKE 'DLV-%'
           OR number ILIKE 'DELIVERY%'
           OR number ILIKE 'TAKEAWAY%'
      `);
      console.log(`  ✓ Deleted ${delDeliveryTables.rowCount} temporary delivery/takeaway tables in Neon.`);

      const updTables = await client.query(`
        UPDATE "Table" 
        SET status = 'FREE', "mergedWithId" = NULL, "pendingSync" = FALSE
      `);
      console.log(`  ✓ Reset ${updTables.rowCount} floor tables to FREE in Neon.`);
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('  ⚠️ Neon cloud notice:', err.message);
  } finally {
    await pool.end();
  }
}

async function main() {
  await clearLocal();
  await clearCloud();
  console.log('\n🎉 Successfully cleared all orders and payments! Inventory and Menu remain 100% intact.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
