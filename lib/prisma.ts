import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Add connection timeout for serverless environments
const databaseUrl = process.env.DATABASE_URL;
const connectionUrl = databaseUrl 
  ? (databaseUrl.includes('connect_timeout') 
      ? databaseUrl 
      : `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connect_timeout=30`)
  : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    ...(connectionUrl ? {
      datasources: {
        db: {
          url: connectionUrl,
        },
      },
    } : {}),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
