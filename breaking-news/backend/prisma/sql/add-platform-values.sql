-- Idempotent hotfix applied at container startup (see backend/railway.json).
-- The production database was created with `prisma db push`, so it has no
-- migration baseline and `prisma migrate deploy` cannot run (P3005). These
-- ALTERs add the Platform enum values the code already relies on. Safe to run
-- on every boot: ADD VALUE IF NOT EXISTS is a no-op once the value exists.
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'REDDIT';
