-- ============================================================
-- Migration 034 — DB cleanup
-- 1. Drop iiif_migrations (one-time tracking table, long done)
-- 2. Drop hunt/story tables (will be rebuilt with cleaner schema)
-- 3. Drop label_pins.confidence (hardcoded 0.8, never used)
-- ============================================================

-- ---- 1. Drop iiif_migrations ----
drop table if exists public.iiif_migrations;


-- ---- 2. Drop story/hunt tables ----
-- First drop the profiles policy that depends on hunts
drop policy if exists "profiles_select_public_authors" on public.profiles;

-- Cascade order: progress → stops → hunts
drop table if exists public.hunt_progress;
drop table if exists public.hunt_stops;
drop table if exists public.hunts;


-- ---- 3. Drop label_pins.confidence ----
alter table public.label_pins drop column if exists confidence;
