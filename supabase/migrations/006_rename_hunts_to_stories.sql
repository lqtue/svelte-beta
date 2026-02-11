-- Migration 006: Rename hunts -> stories conceptually
-- For now, keep the DB table names as-is to avoid breaking changes.
-- Add new columns for story-specific features.

-- Add mode column to hunts table (guided or adventure)
ALTER TABLE public.hunts
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'guided';

-- Add challenge column to hunt_stops (replaces interaction + triggerRadius combo)
ALTER TABLE public.hunt_stops
  ADD COLUMN IF NOT EXISTS challenge jsonb NOT NULL DEFAULT '{"type": "reach", "triggerRadius": 10}';

-- Add camera column to hunt_stops (optional camera position)
ALTER TABLE public.hunt_stops
  ADD COLUMN IF NOT EXISTS camera jsonb;

-- Add author_id alias view (hunts.user_id is the author)
COMMENT ON COLUMN public.hunts.user_id IS 'Author ID (story creator)';
COMMENT ON COLUMN public.hunts.mode IS 'Story mode: guided or adventure';
COMMENT ON COLUMN public.hunt_stops.challenge IS 'Point challenge config: {type, question?, answer?, triggerRadius?}';
COMMENT ON COLUMN public.hunt_stops.camera IS 'Optional camera position: {center, zoom, rotation?}';
