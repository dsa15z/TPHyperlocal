import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Limit connection pool to prevent "Too many database connections" errors
// Railway PostgreSQL typically allows ~20-100 connections total,
// shared between backend + worker + any other services.
const dbUrl = process.env['DATABASE_URL'] || '';
const pooledUrl = dbUrl.includes('connection_limit=')
  ? dbUrl
  : dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'connection_limit=15';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: pooledUrl } } : undefined,
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
