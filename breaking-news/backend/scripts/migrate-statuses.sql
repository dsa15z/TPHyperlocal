-- Migrate old StoryStatus enum values to new editorial states
-- Must run BEFORE prisma db push to avoid enum conflict

-- First update all stories to use only values that exist in BOTH old and new enums
UPDATE "Story" SET status = 'BREAKING' WHERE status = 'BREAKING';
UPDATE "Story" SET status = 'STALE' WHERE status = 'STALE';
UPDATE "Story" SET status = 'ARCHIVED' WHERE status = 'ARCHIVED';

-- Map old values to new values (use a temp text column approach)
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "status_text" TEXT;
UPDATE "Story" SET "status_text" = status::text;

-- Now update the text values
UPDATE "Story" SET "status_text" = 'DEVELOPING' WHERE "status_text" = 'EMERGING';
UPDATE "Story" SET "status_text" = 'TOP_STORY' WHERE "status_text" = 'TRENDING';
UPDATE "Story" SET "status_text" = 'ONGOING' WHERE "status_text" = 'ACTIVE';

-- Drop the old enum column and recreate with new enum type
-- First create the new enum if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoryStatus_new_migration') THEN
    CREATE TYPE "StoryStatus_new_migration" AS ENUM ('ALERT', 'BREAKING', 'DEVELOPING', 'TOP_STORY', 'ONGOING', 'FOLLOW_UP', 'STALE', 'ARCHIVED');
  END IF;
END $$;

-- Update the column
ALTER TABLE "Story" ALTER COLUMN "status" TYPE TEXT;
UPDATE "Story" SET "status" = "status_text" WHERE "status_text" IS NOT NULL;

-- Clean up
ALTER TABLE "Story" DROP COLUMN IF EXISTS "status_text";

-- Also update StoryStateTransition if it exists
-- (It may not exist yet - that's OK)

-- Update any notification filters that reference old statuses
UPDATE "WebhookSubscription" SET events = REPLACE(events::text, '"TRENDING"', '"TOP_STORY"')::jsonb WHERE events::text LIKE '%TRENDING%';

-- Update DigestSubscription filters
UPDATE "DigestSubscription" SET filters = REPLACE(filters::text, '"ACTIVE"', '"ONGOING"')::jsonb WHERE filters IS NOT NULL AND filters::text LIKE '%ACTIVE%';
UPDATE "DigestSubscription" SET filters = REPLACE(filters::text, '"TRENDING"', '"TOP_STORY"')::jsonb WHERE filters IS NOT NULL AND filters::text LIKE '%TRENDING%';
