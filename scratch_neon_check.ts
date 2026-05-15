
import { PrismaClient } from '@prisma/client';

async function main() {
  const neonUrl = "postgresql://neondb_owner:npg_ZVK0y8dBcHAn@ep-flat-dream-a1g37dfu-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: neonUrl,
      },
    },
  });
  try {
    const businesses = await prisma.business.findMany({
      take: 5,
      select: {
        id: true,
        phone: true,
        pushToken: true
      }
    });
    console.log('Sample businesses (Neon):', JSON.stringify(businesses, null, 2));
    
    const withToken = await prisma.business.count({
      where: {
        pushToken: {
          not: null
        }
      }
    });
    console.log('Businesses with push tokens (Neon):', withToken);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
