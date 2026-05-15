
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
    const count = await prisma.business.count();
    console.log('Total businesses (Neon):', count);
    
    if (count > 0) {
      const businesses = await prisma.business.findMany({
        take: 5,
        select: {
          id: true,
          phone: true,
        }
      });
      console.log('Sample businesses (Neon):', JSON.stringify(businesses, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
