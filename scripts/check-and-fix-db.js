/**
 * check-and-fix-db.js
 * Checks if pendingSync columns exist and applies them directly via SQLite
 * Run: node check-and-fix-db.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Checking for missing pendingSync columns in SQLite database...\n");

  // Check Order table
  const orderCols = await prisma.$queryRawUnsafe(`PRAGMA table_info('Order')`);
  const orderHasSync = orderCols.some(c => c.name === 'pendingSync');
  console.log(`Order.pendingSync exists: ${orderHasSync}`);

  const itemCols = await prisma.$queryRawUnsafe(`PRAGMA table_info('OrderItem')`);
  const itemHasSync = itemCols.some(c => c.name === 'pendingSync');
  console.log(`OrderItem.pendingSync exists: ${itemHasSync}`);

  const paymentCols = await prisma.$queryRawUnsafe(`PRAGMA table_info('Payment')`);
  const paymentHasSync = paymentCols.some(c => c.name === 'pendingSync');
  console.log(`Payment.pendingSync exists: ${paymentHasSync}`);

  const cancelCols = await prisma.$queryRawUnsafe(`PRAGMA table_info('Cancellation')`);
  const cancelHasSync = cancelCols.some(c => c.name === 'pendingSync');
  console.log(`Cancellation.pendingSync exists: ${cancelHasSync}`);

  const menuCols = await prisma.$queryRawUnsafe(`PRAGMA table_info('MenuItem')`);
  const menuHasBar = menuCols.some(c => c.name === 'barQuantity');
  const menuHasCost = menuCols.some(c => c.name === 'costPrice');
  const menuHasThreshold = menuCols.some(c => c.name === 'lowStockThreshold');
  const menuHasParent = menuCols.some(c => c.name === 'parentItemId');
  const menuHasMultiplier = menuCols.some(c => c.name === 'unitMultiplier');
  console.log(`\nMenuItem.barQuantity exists: ${menuHasBar}`);
  console.log(`MenuItem.costPrice exists: ${menuHasCost}`);
  console.log(`MenuItem.lowStockThreshold exists: ${menuHasThreshold}`);
  console.log(`MenuItem.parentItemId exists: ${menuHasParent}`);
  console.log(`MenuItem.unitMultiplier exists: ${menuHasMultiplier}`);

  const missing = [];

  // Apply missing columns directly (SQLite supports ADD COLUMN but not RENAME TABLE in a transaction easily)
  if (!orderHasSync) {
    console.log('\n⚡ Adding Order.pendingSync ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN "pendingSync" BOOLEAN NOT NULL DEFAULT 1`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN "syncedAt" DATETIME`);
    missing.push('Order');
  }
  if (!itemHasSync) {
    console.log('⚡ Adding OrderItem.pendingSync ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "OrderItem" ADD COLUMN "pendingSync" BOOLEAN NOT NULL DEFAULT 1`);
    missing.push('OrderItem');
  }
  if (!paymentHasSync) {
    console.log('⚡ Adding Payment.pendingSync ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Payment" ADD COLUMN "pendingSync" BOOLEAN NOT NULL DEFAULT 1`);
    missing.push('Payment');
  }
  if (!cancelHasSync) {
    console.log('⚡ Adding Cancellation.pendingSync ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Cancellation" ADD COLUMN "pendingSync" BOOLEAN NOT NULL DEFAULT 1`);
    missing.push('Cancellation');
  }
  if (!menuHasBar) {
    console.log('⚡ Adding MenuItem.barQuantity ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "MenuItem" ADD COLUMN "barQuantity" INTEGER NOT NULL DEFAULT 0`);
    missing.push('MenuItem.barQuantity');
  }
  if (!menuHasCost) {
    console.log('⚡ Adding MenuItem.costPrice ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "MenuItem" ADD COLUMN "costPrice" REAL NOT NULL DEFAULT 0`);
    missing.push('MenuItem.costPrice');
  }
  if (!menuHasThreshold) {
    console.log('⚡ Adding MenuItem.lowStockThreshold ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "MenuItem" ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5`);
    missing.push('MenuItem.lowStockThreshold');
  }
  if (!menuHasParent) {
    console.log('⚡ Adding MenuItem.parentItemId ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "MenuItem" ADD COLUMN "parentItemId" TEXT`);
    missing.push('MenuItem.parentItemId');
  }
  if (!menuHasMultiplier) {
    console.log('⚡ Adding MenuItem.unitMultiplier ...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "MenuItem" ADD COLUMN "unitMultiplier" REAL NOT NULL DEFAULT 1`);
    missing.push('MenuItem.unitMultiplier');
  }

  if (missing.length === 0) {
    console.log('\n✅ All columns are present. Database schema is already up to date!');
    console.log('\nIf you are still seeing errors, try restarting the dev server:');
    console.log('  1. Stop npm run dev');
    console.log('  2. Run: npx prisma generate');
    console.log('  3. Run: npm run dev');
  } else {
    console.log(`\n✅ Fixed! Added missing columns to: ${missing.join(', ')}`);
    console.log('\nNow please:');
    console.log('  1. Stop npm run dev (if running)');
    console.log('  2. Run: npx prisma generate');
    console.log('  3. Run: npm run dev');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
