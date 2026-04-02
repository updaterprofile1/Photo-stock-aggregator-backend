-- Add durable submission history for thumbnail/metadata persistence records.
ALTER TABLE "assets"
ADD COLUMN "submission_history" JSONB NOT NULL DEFAULT '[]'::jsonb;
