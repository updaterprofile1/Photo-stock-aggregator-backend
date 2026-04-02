-- DELTA MIGRATION — adds only the new objects required for item 19.
--
-- Existing tables (users, portfolios, assets) and their enums
-- (content_origin, asset_status, retention_state) are left untouched.
-- This migration is safe to run against any database that already has
-- those objects in place.

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'uploading', 'submitted', 'accepted', 'rejected', 'distributed');

-- CreateTable
CREATE TABLE "submission_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "site_slug" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "asset_ids" TEXT[],
    "provider" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_jobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "submission_jobs" ADD CONSTRAINT "submission_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
