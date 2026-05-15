
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const businesses = await prisma.business.findMany({
      take: 5,
      select: {
        id: true,
        phone: true,
        pushToken: true
      }
    });
    console.log('Sample businesses:', JSON.stringify(businesses, null, 2));
    
    // Check if any business has a push token
    const withToken = await prisma.business.count({
      where: {
        pushToken: {
          not: null
        }
      }
    });
    console.log('Businesses with push tokens:', withToken);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
