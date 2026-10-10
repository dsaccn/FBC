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

const CATEGORIES = [
  { id: 'cat_hot_drinks', name: 'Hot Drinks', type: 'DRINK' },
  { id: 'cat_iced', name: 'Iced', type: 'DRINK' },
  { id: 'cat_mojito', name: 'Mojito', type: 'DRINK' },
  { id: 'cat_cake', name: 'Cake', type: 'FOOD' },
];

const MENU_ITEMS = [
  // ─── HOT DRINKS ──────────────────────────────────────────────
  { id: 'item_hd_tea', name: 'Tea', price: 70, description: 'Traditional hot tea', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_ginger_tea', name: 'Ginger Tea', price: 90, description: 'Fresh spiced ginger tea', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_cinnamon_tea', name: 'Cinnamon Tea', price: 90, description: 'Warm aromatic cinnamon tea', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_lemon_tea', name: 'Lemon Tea', price: 90, description: 'Hot tea infused with fresh lemon', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_green_tea', name: 'Green Tea', price: 100, description: 'Healthy brewed green tea', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_peanut_tea', name: 'Peanut Tea', price: 150, description: 'Rich nutty peanut tea', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_flavor_tea', name: 'Flavor Tea', price: 100, description: 'Flavored herbal tea', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_special_tea', name: 'Special Tea', price: 220, description: 'House special spiced tea', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_ginger_tea_honey', name: 'Ginger Tea with Honey', price: 150, description: 'Fresh ginger tea with pure honey', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_macchiato_small', name: 'Macchiato Small', price: 140, description: 'Single espresso with steamed milk foam', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_double_macchiato', name: 'Double Macchiato', price: 270, description: 'Double espresso macchiato', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_fasting_macchiato', name: 'Fasting Macchiato', price: 180, description: 'Dairy-free fasting macchiato', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_double_fasting_macchiato', name: 'Double Fasting Macchiato', price: 350, description: 'Double shot dairy-free macchiato', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_peanut_macchiato', name: 'Peanut with Macchiato', price: 200, description: 'Macchiato blended with peanut cream', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_caramel_macchiato', name: 'Caramel Macchiato', price: 220, description: 'Espresso with steamed milk and caramel', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_cappuccino', name: 'Cappuccino', price: 240, description: 'Rich espresso with velvety froth', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_mocha_latte', name: 'Mocha Latte', price: 250, description: 'Espresso with rich chocolate and steamed milk', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_peanut_milk', name: 'Peanut with Milk', price: 250, description: 'Steamed milk with smooth peanut cream', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_peanut_ginger', name: 'Peanut with Ginger', price: 160, description: 'Warm peanut drink infused with fresh ginger', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_milk', name: 'Milk', price: 180, description: 'Fresh steamed hot milk', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_milk_coffee', name: 'Milk with Coffee', price: 200, description: 'Warm milk with a splash of brewed coffee', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_spice', name: 'Spice', price: 130, description: 'Warming traditional spiced drink', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_americano', name: 'Americano', price: 140, description: 'Rich espresso diluted with hot water', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_espresso', name: 'Espresso', price: 140, description: 'Single shot rich concentrated espresso', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_coffee', name: 'Coffee', price: 150, description: 'Freshly roasted Ethiopian coffee', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_double_espresso', name: 'Double Espresso', price: 270, description: 'Double shot rich concentrated espresso', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_curvat', name: 'Curvat', price: 100, description: 'Cortado / Curvat espresso cut with warm milk', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_hot_chocolate', name: 'Hot Chocolate', price: 290, description: 'Velvety rich hot chocolate', categoryId: 'cat_hot_drinks' },
  { id: 'item_hd_cafe_latte', name: 'Cafe Latte', price: 240, description: 'Espresso balanced with silky steamed milk', categoryId: 'cat_hot_drinks' },

  // ─── MOJITO & COLD DRINKS ──────────────────────────────────
  { id: 'item_mojito_pineapple', name: 'Pineapple Mojito', price: 290, description: 'Pineapple, ice, sprite, lemon, mint', categoryId: 'cat_mojito' },
  { id: 'item_mojito_special', name: 'Special Mojito', price: 350, description: 'Orange, pineapple, mint, ginger, lemon, strawberry', categoryId: 'cat_mojito' },
  { id: 'item_mojito_strawberry', name: 'Strawberry Mojito', price: 290, description: 'Strawberry, sprite, ice, mint, syrup', categoryId: 'cat_mojito' },
  { id: 'item_mojito_lemon', name: 'Lemon Mojito', price: 250, description: 'Fresh lemon, mint, sprite, crushed ice', categoryId: 'cat_mojito' },
  { id: 'item_mojito_soft_drink', name: 'Soft Drink (Plastic)', price: 120, description: 'Bottled soft drink', categoryId: 'cat_mojito', stockQuantity: 50, barQuantity: 20, lowStockThreshold: 10 },
  { id: 'item_mojito_water', name: 'Half Bottle Water', price: 60, description: '500ml mineral water', categoryId: 'cat_mojito', stockQuantity: 50, barQuantity: 20, lowStockThreshold: 10 },

  // ─── ICED DRINKS ───────────────────────────────────────────
  { id: 'item_iced_tea', name: 'Ice Tea', price: 150, description: 'Chilled iced brewed tea', categoryId: 'cat_iced' },
  { id: 'item_iced_coffee', name: 'Ice Coffee', price: 200, description: 'Chilled coffee served over ice', categoryId: 'cat_iced' },
  { id: 'item_iced_latte', name: 'Ice Latte', price: 200, description: 'Espresso and cold milk poured over ice', categoryId: 'cat_iced' },
  { id: 'item_iced_mocha_latte', name: 'Mocha Ice Latte', price: 290, description: 'Espresso, rich chocolate and milk over ice', categoryId: 'cat_iced' },
  { id: 'item_iced_lemon_latte', name: 'Lemon Ice Latte', price: 290, description: 'Espresso, cold milk and lemon twist over ice', categoryId: 'cat_iced' },
  { id: 'item_iced_fasting_latte', name: 'Fasting Ice Latte', price: 290, description: 'Dairy-free iced latte', categoryId: 'cat_iced' },

  // ─── CAKE & PASTRIES ───────────────────────────────────────
  { id: 'item_cake_english', name: 'English Cake', price: 190, description: 'Traditional English sponge cake slice', categoryId: 'cat_cake' },
  { id: 'item_cake_fasting_banana', name: 'Fasting Banana Cake', price: 160, description: 'Dairy-free fasting banana cake slice', categoryId: 'cat_cake' },
  { id: 'item_cake_croissant', name: 'Butter Croissant', price: 320, description: 'Fresh flaky golden butter croissant', categoryId: 'cat_cake' },
];

async function seedLocal() {
  console.log('\n📦 Seeding Local SQLite database...');
  const prisma = new PrismaClient();

  try {
    for (const cat of CATEGORIES) {
      await prisma.category.upsert({
        where: { id: cat.id },
        update: { name: cat.name, type: cat.type },
        create: { id: cat.id, name: cat.name, type: cat.type },
      });
    }
    console.log(`  ✓ Upserted ${CATEGORIES.length} categories locally.`);

    for (const item of MENU_ITEMS) {
      await prisma.menuItem.upsert({
        where: { id: item.id },
        update: {
          name: item.name,
          price: item.price,
          description: item.description,
          categoryId: item.categoryId,
          available: true,
          stockQuantity: item.stockQuantity ?? 0,
          barQuantity: item.barQuantity ?? 0,
          lowStockThreshold: item.lowStockThreshold ?? 5,
        },
        create: {
          id: item.id,
          name: item.name,
          price: item.price,
          description: item.description,
          categoryId: item.categoryId,
          available: true,
          stockQuantity: item.stockQuantity ?? 0,
          barQuantity: item.barQuantity ?? 0,
          lowStockThreshold: item.lowStockThreshold ?? 5,
        },
      });
    }
    console.log(`  ✓ Upserted ${MENU_ITEMS.length} menu items locally.`);
  } catch (err) {
    console.error('  ✗ Error seeding local SQLite:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedCloud() {
  if (!process.env.NEON_DATABASE_URL) {
    console.log('\n⚠️ NEON_DATABASE_URL not set. Skipping cloud seed.');
    return;
  }

  console.log('\n☁️  Seeding Neon Cloud PostgreSQL database...');
  const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    try {
      for (const cat of CATEGORIES) {
        await client.query(`
          INSERT INTO "Category" (id, name, type, "createdAt")
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name, type = EXCLUDED.type
        `, [cat.id, cat.name, cat.type]);
      }
      console.log(`  ✓ Upserted ${CATEGORIES.length} categories in cloud.`);

      for (const item of MENU_ITEMS) {
        await client.query(`
          INSERT INTO "MenuItem" (id, name, price, description, "categoryId", available, "stockQuantity", "barQuantity", "costPrice", "lowStockThreshold", "unitMultiplier", "createdAt")
          VALUES ($1, $2, $3, $4, $5, true, $6, $7, 0, $8, 1, NOW())
          ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              price = EXCLUDED.price,
              description = EXCLUDED.description,
              "categoryId" = EXCLUDED."categoryId",
              available = true,
              "stockQuantity" = EXCLUDED."stockQuantity",
              "barQuantity" = EXCLUDED."barQuantity",
              "lowStockThreshold" = EXCLUDED."lowStockThreshold"
        `, [
          item.id,
          item.name,
          item.price,
          item.description,
          item.categoryId,
          item.stockQuantity ?? 0,
          item.barQuantity ?? 0,
          item.lowStockThreshold ?? 5
        ]);
      }
      console.log(`  ✓ Upserted ${MENU_ITEMS.length} menu items in cloud.`);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('  ✗ Error seeding cloud database:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('=========================================');
  console.log('   KOGNA COFFEE MENU IMPORT              ');
  console.log('=========================================');

  await seedLocal();
  await seedCloud();

  console.log('\n=========================================');
  console.log(`🎉 Successfully loaded all 4 categories & ${MENU_ITEMS.length} menu items!`);
  console.log('=========================================\n');
}

main().catch(console.error);
