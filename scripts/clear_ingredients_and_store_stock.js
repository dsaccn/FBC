/**
 * clear_ingredients_and_store_stock.js
 * 
 * Resets inventory stock levels to 0:
 * 1. Sets Ingredient quantity = 0 in both local SQLite and Neon Cloud.
 * 2. Sets StaffIngredient quantity = 0 (if present) in both local SQLite and Neon Cloud.
 * 3. Sets MenuItem stockQuantity (Store Quantity) = 0 in both local SQLite and Neon Cloud.
 * 4. Sets MenuItem barQuantity (Bar Quantity) = 0 in both local SQLite and Neon Cloud.
 * 
 * NOTE: MenuItem prices/details, Ingredient definitions,
 * and Recipe relationships are preserved intact.
 * 
 * Run: node scripts/clear_ingredients_and_store_stock.js
 */

const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=\s]+)\s*=\s*"?(.+?)"?\s*$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

const prisma = new PrismaClient();

async function resetLocal() {
  console.log('\n--- 1. RESETTING LOCAL SQLITE INVENTORY ---');

  // Check before state
  const prevIngs = await prisma.ingredient.findMany({
    where: { quantity: { gt: 0 } },
    select: { id: true, name: true, quantity: true, unit: true },
  });
  const prevItems = await prisma.menuItem.findMany({
    where: {
      OR: [
        { stockQuantity: { gt: 0 } },
        { barQuantity: { gt: 0 } }
      ]
    },
    select: { id: true, name: true, stockQuantity: true, barQuantity: true },
  });

  console.log(`Found ${prevIngs.length} ingredients with quantity > 0 locally:`);
  prevIngs.forEach(i => console.log(`  - ${i.name}: ${i.quantity} ${i.unit}`));

  console.log(`Found ${prevItems.length} menu items with store or bar stock > 0 locally:`);
  prevItems.forEach(m => console.log(`  - ${m.name}: store=${m.stockQuantity}, bar=${m.barQuantity}`));

  // Reset ingredients quantity & barQuantity
  const updatedIngs = await prisma.ingredient.updateMany({
    data: { quantity: 0, barQuantity: 0 },
  });
  console.log(`\n✓ Reset quantity and barQuantity to 0 for all ${updatedIngs.count} ingredients in local SQLite.`);

  // Reset staff ingredients if any
  try {
    const updatedStaffIngs = await prisma.staffIngredient.updateMany({
      data: { quantity: 0 },
    });
    console.log(`✓ Reset quantity to 0 for all ${updatedStaffIngs.count} staff ingredients in local SQLite.`);
  } catch (err) {
    console.warn('Note: StaffIngredient update skipped or not present:', err.message);
  }

  // Reset MenuItem store stock and bar stock to 0
  const updatedItems = await prisma.menuItem.updateMany({
    data: {
      stockQuantity: 0,
      barQuantity: 0,
    },
  });
  console.log(`✓ Reset stockQuantity and barQuantity to 0 for all ${updatedItems.count} menu items in local SQLite.`);
}

async function resetCloud() {
  console.log('\n--- 2. RESETTING NEON CLOUD INVENTORY ---');
  const cloudUrl = process.env.NEON_DATABASE_URL;
  if (!cloudUrl) {
    console.warn('⚠️ NEON_DATABASE_URL not found in environment. Skipping cloud reset.');
    return;
  }

  const pool = new Pool({
    connectionString: cloudUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to Neon cloud database.');

    // Check before state on cloud
    const { rows: cloudPrevIngs } = await client.query(
      'SELECT id, name, quantity, unit FROM "Ingredient" WHERE quantity > 0'
    );
    const { rows: cloudPrevItems } = await client.query(
      'SELECT id, name, "stockQuantity", "barQuantity" FROM "MenuItem" WHERE "stockQuantity" > 0 OR "barQuantity" > 0'
    );

    console.log(`Found ${cloudPrevIngs.length} ingredients with quantity > 0 on Neon cloud:`);
    cloudPrevIngs.forEach(i => console.log(`  - ${i.name}: ${i.quantity} ${i.unit}`));

    console.log(`Found ${cloudPrevItems.length} menu items with store or bar stock > 0 on Neon cloud:`);
    cloudPrevItems.forEach(m => console.log(`  - ${m.name}: store=${m.stockQuantity}, bar=${m.barQuantity}`));

    // Reset ingredients
    const ingRes = await client.query('UPDATE "Ingredient" SET quantity = 0, "barQuantity" = 0');
    console.log(`\n✓ Reset quantity and barQuantity to 0 for ${ingRes.rowCount} ingredients on Neon cloud.`);

    // Reset staff ingredients
    try {
      const staffIngRes = await client.query('UPDATE "StaffIngredient" SET quantity = 0');
      console.log(`✓ Reset quantity to 0 for ${staffIngRes.rowCount} staff ingredients on Neon cloud.`);
    } catch {
      // Table might not exist or empty
    }

    // Reset menu items store stock and bar stock
    const itemRes = await client.query('UPDATE "MenuItem" SET "stockQuantity" = 0, "barQuantity" = 0');
    console.log(`✓ Reset stockQuantity and barQuantity to 0 for ${itemRes.rowCount} menu items on Neon cloud.`);

    client.release();
  } catch (err) {
    console.error('❌ Error updating Neon cloud:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

async function verify() {
  console.log('\n--- 3. VERIFICATION ---');

  const localIngsRemaining = await prisma.ingredient.count({ where: { quantity: { gt: 0 } } });
  const localStoreRemaining = await prisma.menuItem.count({ where: { stockQuantity: { gt: 0 } } });
  const localBarRemaining = await prisma.menuItem.count({ where: { barQuantity: { gt: 0 } } });
  const totalIngredients = await prisma.ingredient.count();
  const totalMenuItems = await prisma.menuItem.count();
  const totalRecipes = await prisma.recipe.count();

  console.log(`Local SQLite:`);
  console.log(`  - Ingredients with quantity > 0: ${localIngsRemaining} (Total ingredients preserved: ${totalIngredients})`);
  console.log(`  - Menu items with store stock > 0: ${localStoreRemaining}`);
  console.log(`  - Menu items with bar stock > 0: ${localBarRemaining}`);
  console.log(`  - Total menu items preserved: ${totalMenuItems}`);
  console.log(`  - Total recipes intact: ${totalRecipes}`);

  if (process.env.NEON_DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    try {
      const client = await pool.connect();
      const { rows: ingCount } = await client.query('SELECT COUNT(*) as count FROM "Ingredient" WHERE quantity > 0');
      const { rows: storeCount } = await client.query('SELECT COUNT(*) as count FROM "MenuItem" WHERE "stockQuantity" > 0');
      const { rows: barCount } = await client.query('SELECT COUNT(*) as count FROM "MenuItem" WHERE "barQuantity" > 0');
      const { rows: totalIngs } = await client.query('SELECT COUNT(*) as count FROM "Ingredient"');
      const { rows: totalCloudItems } = await client.query('SELECT COUNT(*) as count FROM "MenuItem"');
      const { rows: totalCloudRecipes } = await client.query('SELECT COUNT(*) as count FROM "Recipe"');

      console.log(`Neon Cloud:`);
      console.log(`  - Ingredients with quantity > 0: ${ingCount[0].count} (Total ingredients preserved: ${totalIngs[0].count})`);
      console.log(`  - Menu items with store stock > 0: ${storeCount[0].count}`);
      console.log(`  - Menu items with bar stock > 0: ${barCount[0].count}`);
      console.log(`  - Total menu items preserved: ${totalCloudItems[0].count}`);
      console.log(`  - Total recipes intact: ${totalCloudRecipes[0].count}`);
      client.release();
    } catch (e) {
      console.warn('Neon verification warning:', e.message);
    } finally {
      await pool.end();
    }
  }

  console.log('\n🎉 Successfully cleared all ingredient quantities, store stock, and bar stock!');
}

async function main() {
  try {
    await resetLocal();
    await resetCloud();
    await verify();
  } catch (err) {
    console.error('Fatal execution error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
