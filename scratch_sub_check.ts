
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
    const subs = await prisma.subscription.count();
    console.log('Total subscriptions (Neon):', subs);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
