const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query'],
});

async function test() {
  try {
    console.log('Testing Prisma connection...');
    const user = await prisma.user.findUnique({
      where: { username: 'admin' }
    });
    console.log('User found:', user);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
