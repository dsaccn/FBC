import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import * as fs from 'fs';

// Load .env
if (fs.existsSync('./.env')) {
  const envFile = fs.readFileSync('./.env', 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

async function clearOffline() {
  console.log("\n🧹 Clearing Offline (Local SQLite) database...");
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });

  try {
    // 1. Cancellations (FK -> OrderItem)
    const cancellations = await prisma.cancellation.deleteMany({});
    console.log(`  ✓ Deleted ${cancellations.count} local cancellations.`);
    
    // 2. Payments (FK -> Order)
    const payments = await prisma.payment.deleteMany({});
    console.log(`  ✓ Deleted ${payments.count} local payments.`);
    
    // 3. Order Items (FK -> Order, MenuItem)
    const orderItems = await prisma.orderItem.deleteMany({});
    console.log(`  ✓ Deleted ${orderItems.count} local order items.`);
    
    // 4. Orders (FK -> Table, User)
    const orders = await prisma.order.deleteMany({});
    console.log(`  ✓ Deleted ${orders.count} local orders.`);
    
    // 5. Shift Logs (FK -> User)
    const shiftLogs = await prisma.shiftLog.deleteMany({});
    console.log(`  ✓ Deleted ${shiftLogs.count} local shift logs.`);

    // 6. Inventory Logs
    const invLogs = await prisma.inventoryLog.deleteMany({});
    console.log(`  ✓ Deleted ${invLogs.count} local inventory logs.`);

    // 7. Staff Meals, Recipes, Items, Ingredients
    await prisma.staffMealItem.deleteMany({});
    await prisma.staffMeal.deleteMany({});
    await prisma.staffRecipe.deleteMany({});
    await prisma.staffMenuItem.deleteMany({});
    await prisma.staffIngredient.deleteMany({});
    console.log(`  ✓ Cleared local staff kitchen logs, meals and items.`);

    // 8. Recipes (FK -> MenuItem, Ingredient)
    const recipes = await prisma.recipe.deleteMany({});
    console.log(`  ✓ Deleted ${recipes.count} local recipes.`);

    // 9. Unlink self-referencing MenuItem parentItemId
    await prisma.menuItem.updateMany({
      data: { parentItemId: null }
    });

    // 10. Menu Items (FK -> Category)
    const menuItems = await prisma.menuItem.deleteMany({});
    console.log(`  ✓ Deleted ${menuItems.count} local menu items.`);

    // 11. Categories
    const categories = await prisma.category.deleteMany({});
    console.log(`  ✓ Deleted ${categories.count} local categories.`);

    // 12. Ingredients
    const ingredients = await prisma.ingredient.deleteMany({});
    console.log(`  ✓ Deleted ${ingredients.count} local ingredients.`);

    // 13. Remove virtual tables & reset physical tables to FREE
    const delTables = await prisma.table.deleteMany({
      where: {
        OR: [
          { number: { startsWith: 'Delivery:' } },
          { number: { startsWith: 'Takeaway:' } },
          { number: { startsWith: 'DLV-' } },
          { number: 'Archived' },
        ]
      }
    });
    console.log(`  ✓ Removed ${delTables.count} virtual delivery/takeaway tables.`);

    await prisma.table.updateMany({
      data: {
        status: 'FREE',
        mergedWithId: null,
      }
    });
    console.log("  ✓ Reset all local tables to FREE.");
  } catch (err) {
    console.error("  ✗ Error clearing local database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

async function clearCloud() {
  if (!process.env.NEON_DATABASE_URL) {
    console.log("\n⚠️ NEON_DATABASE_URL not set in .env. Skipping cloud clean.");
    return;
  }

  console.log("\n☁️  Clearing Online Cloud (Neon PostgreSQL) database...");
  const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    try {
      // 1. Cancellations
      const res1 = await client.query('DELETE FROM "Cancellation"');
      console.log(`  ✓ Deleted ${res1.rowCount} cloud cancellations.`);
      
      // 2. Payments
      const res2 = await client.query('DELETE FROM "Payment"');
      console.log(`  ✓ Deleted ${res2.rowCount} cloud payments.`);
      
      // 3. Order Items
      const res3 = await client.query('DELETE FROM "OrderItem"');
      console.log(`  ✓ Deleted ${res3.rowCount} cloud order items.`);
      
      // 4. Orders
      const res4 = await client.query('DELETE FROM "Order"');
      console.log(`  ✓ Deleted ${res4.rowCount} cloud orders.`);
      
      // 5. Shift Logs
      const res5 = await client.query('DELETE FROM "ShiftLog"');
      console.log(`  ✓ Deleted ${res5.rowCount} cloud shift logs.`);

      // 6. Inventory Logs
      const res6 = await client.query('DELETE FROM "InventoryLog"');
      console.log(`  ✓ Deleted ${res6.rowCount} cloud inventory logs.`);

      // 7. Staff Kitchen models
      await client.query('DELETE FROM "StaffMealItem"');
      await client.query('DELETE FROM "StaffMeal"');
      await client.query('DELETE FROM "StaffRecipe"');
      await client.query('DELETE FROM "StaffMenuItem"');
      await client.query('DELETE FROM "StaffIngredient"');
      console.log(`  ✓ Cleared cloud staff kitchen logs, meals and items.`);

      // 8. Recipes
      const res7 = await client.query('DELETE FROM "Recipe"');
      console.log(`  ✓ Deleted ${res7.rowCount} cloud recipes.`);

      // 9. Unlink MenuItem parentItemId
      await client.query('UPDATE "MenuItem" SET "parentItemId" = NULL');

      // 10. Menu Items
      const res8 = await client.query('DELETE FROM "MenuItem"');
      console.log(`  ✓ Deleted ${res8.rowCount} cloud menu items.`);

      // 11. Categories
      const res9 = await client.query('DELETE FROM "Category"');
      console.log(`  ✓ Deleted ${res9.rowCount} cloud categories.`);

      // 12. Ingredients
      const res10 = await client.query('DELETE FROM "Ingredient"');
      console.log(`  ✓ Deleted ${res10.rowCount} cloud ingredients.`);

      // 13. Virtual Tables & Reset Tables
      const res11 = await client.query(`
        DELETE FROM "Table" 
        WHERE number LIKE 'Delivery:%' 
           OR number LIKE 'Takeaway:%' 
           OR number LIKE 'DLV-%' 
           OR number = 'Archived'
      `);
      console.log(`  ✓ Removed ${res11.rowCount} virtual delivery/takeaway tables from cloud.`);

      await client.query(`UPDATE "Table" SET status = 'FREE', "mergedWithId" = NULL`);
      console.log("  ✓ Reset all cloud tables to FREE.");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("  ✗ Error clearing cloud database:", err);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log("=========================================");
  console.log("   POS DATA CLEANUP (LOCAL & CLOUD)      ");
  console.log("=========================================");
  
  await clearOffline();
  await clearCloud();

  console.log("\n=========================================");
  console.log("✨ All inventory logs, items, menu, and ingredients cleared successfully!");
  console.log("   Users & Table numbers are preserved.");
  console.log("=========================================\n");
}

main().catch(console.error);
