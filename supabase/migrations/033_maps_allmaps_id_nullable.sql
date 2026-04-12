-- ============================================================
-- Migration 033 — make maps.allmaps_id nullable
-- A map can exist before it has been georeferenced in Allmaps.
-- The unique constraint is preserved (no two maps share an ID).
-- ============================================================

alter table public.maps
  alter column allmaps_id drop not null;
