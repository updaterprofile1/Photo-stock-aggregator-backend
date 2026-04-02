-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "content_origin" AS ENUM ('ai', 'non-ai');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('draft', 'ready', 'submitted', 'accepted', 'rejected', 'distributed', 'original_deleted', 'thumbnail_only');

-- CreateEnum
CREATE TYPE "retention_state" AS ENUM ('active', 'deleted', 'archived');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'uploading', 'submitted', 'accepted', 'rejected', 'distributed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content_origin" "content_origin" NOT NULL,
    "status" "asset_status" NOT NULL DEFAULT 'draft',
    "file_url" TEXT NOT NULL,
    "storage_key" TEXT,
    "thumbnail_url" TEXT,
    "thumbnail_storage_key" TEXT,
    "retention_state" "retention_state" NOT NULL DEFAULT 'active',
    "original_deleted_at" TIMESTAMP(3),
    "metadata_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

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

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_jobs" ADD CONSTRAINT "submission_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
