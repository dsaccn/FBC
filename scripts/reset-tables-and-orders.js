/**
 * reset-tables-and-orders.js
 * Administrative script to:
 * 1. Clear all orders, order items, payments, and cancellations in both SQLite and Neon.
 * 2. Reset all tables to 'FREE' status and clear 'mergedWithId' in both SQLite and Neon.
 *
 * Run: node reset-tables-and-orders.js
 */
const { PrismaClient } = require('@prisma/client');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Manually load .env variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const match = line.match(/^([^#=\s]+)\s*=\s*"?(.+?)"?\s*$/);
    if (match) process.env[match[1]] = match[2];
  });
}

const prisma = new PrismaClient();

async function resetLocalSQLite() {
  console.log('--- RESETTING LOCAL SQLITE ---');
  try {
    // 1. Delete Cancellations (references OrderItem)
    const cancellations = await prisma.cancellation.deleteMany({});
    console.log(`✓ Deleted ${cancellations.count} cancellations in local SQLite.`);

    // 2. Delete Payments (references Order)
    const payments = await prisma.payment.deleteMany({});
    console.log(`✓ Deleted ${payments.count} payments in local SQLite.`);

    // 3. Delete OrderItems (references Order)
    const orderItems = await prisma.orderItem.deleteMany({});
    console.log(`✓ Deleted ${orderItems.count} order items in local SQLite.`);

    // 4. Delete Orders
    const orders = await prisma.order.deleteMany({});
    console.log(`✓ Deleted ${orders.count} orders in local SQLite.`);

    // 5. Reset Tables status to FREE and mergedWithId to null
    const tables = await prisma.table.updateMany({
      data: {
        status: 'FREE',
        mergedWithId: null,
      },
    });
    console.log(`✓ Reset ${tables.count} tables to FREE and cleared merged status in local SQLite.`);
    console.log('✅ Local SQLite reset complete.\n');
  } catch (error) {
    console.error('❌ Error resetting local SQLite:', error);
    throw error;
  }
}

async function resetNeonCloud() {
  console.log('--- RESETTING NEON CLOUD POSTGRESQL ---');
  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    console.warn('⚠️ NEON_DATABASE_URL not set in .env. Skipping Neon reset.');
    return;
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log('✓ Connected to Neon cloud database.');

    // Delete in order to satisfy FK constraints
    const delCancel = await client.query('DELETE FROM "Cancellation"');
    console.log(`✓ Deleted ${delCancel.rowCount} cancellations in Neon.`);

    const delPay = await client.query('DELETE FROM "Payment"');
    console.log(`✓ Deleted ${delPay.rowCount} payments in Neon.`);

    const delItems = await client.query('DELETE FROM "OrderItem"');
    console.log(`✓ Deleted ${delItems.rowCount} order items in Neon.`);

    const delOrders = await client.query('DELETE FROM "Order"');
    console.log(`✓ Deleted ${delOrders.rowCount} orders in Neon.`);

    // Reset Table status and mergedWithId
    const updTables = await client.query('UPDATE "Table" SET status = \'FREE\', "mergedWithId" = NULL');
    console.log(`✓ Reset ${updTables.rowCount} tables to FREE and cleared merged status in Neon.`);
    console.log('✅ Neon cloud reset complete.\n');
  } catch (error) {
    console.error('❌ Error resetting Neon cloud database:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('🧹 Starting full system reset of tables and orders...\n');
  
  await resetLocalSQLite();
  await resetNeonCloud();

  console.log('🎉 Database cleanup successfully completed!');
}

main()
  .catch(err => {
    console.error('❌ Fatal error during reset:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
