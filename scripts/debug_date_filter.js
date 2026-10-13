const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { parseDateFilter } = require('../src/lib/date-utils');

async function main() {
  console.log('1. Recent 10 orders:');
  const orders = await prisma.order.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, createdAt: true }
  });

  orders.forEach(o => {
    console.log(`ID: ${o.id} | Status: ${o.status} | CreatedAt: ${o.createdAt?.toISOString()} | Local: ${o.createdAt?.toLocaleString()}`);
  });

  // Test date filter for today (2026-10-13)
  console.log('\n2. Testing parseDateFilter for 2026-10-13 with tz = -180 (Addis Ababa):');
  const filter = parseDateFilter('2026-10-13', '2026-10-13', '-180');
  console.log('Filter object:', filter);
  console.log('gte ISO:', filter.gte.toISOString());
  console.log('lte ISO:', filter.lte.toISOString());

  const matched = await prisma.order.findMany({
    where: {
      status: 'PAID',
      createdAt: filter
    },
    select: { id: true, status: true, createdAt: true }
  });
  console.log(`Matched PAID orders with 2026-10-13: ${matched.length}`);

  // Test date filter for yesterday (2026-10-12)
  console.log('\n3. Testing parseDateFilter for 2026-10-12 with tz = -180:');
  const filterYesterday = parseDateFilter('2026-10-12', '2026-10-12', '-180');
  console.log('Yesterday filter object:', filterYesterday);
  const matchedYesterday = await prisma.order.findMany({
    where: {
      status: 'PAID',
      createdAt: filterYesterday
    },
    select: { id: true, status: true, createdAt: true }
  });
  console.log(`Matched PAID orders with 2026-10-12: ${matchedYesterday.length}`);
  matchedYesterday.forEach(o => {
    console.log(`Yesterday match -> ID: ${o.id} | CreatedAt: ${o.createdAt?.toISOString()}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
