const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('1. Setting WAL journal mode...');
    const journalRes = await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    console.log('   Journal mode:', JSON.stringify(journalRes));

    console.log('2. Setting 5-second busy timeout...');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');

    console.log('3. Testing write operation...');
    const user = await prisma.user.findFirst();
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { active: true }
      });
      console.log('   SUCCESS: Database is fully writable!');
    } else {
      console.log('   No user found to test, but PRAGMAs executed successfully.');
    }
  } catch (err) {
    console.error('   ERROR testing database write:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
