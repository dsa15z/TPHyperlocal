-- Add missing Platform enum values.
-- The initial migration created "Platform" without INSTAGRAM (used by the
-- social-publish Instagram routes) and without REDDIT (present in schema.prisma
-- but never migrated). Querying/inserting either value fails at runtime with
-- "Invalid value for argument `in`. Expected Platform." (Prisma) — a 500 on any
-- AccountCredential query that references them.
--
-- ALTER TYPE ... ADD VALUE is idempotent via IF NOT EXISTS (PostgreSQL 9.6+)
-- and, on PostgreSQL 12+, is safe to run inside the migration transaction.
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'REDDIT';
