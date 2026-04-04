-- Improve label/footprint schema for SAM training data quality.
-- Fixes:
--   1. label_tasks: cast map_id TEXT → UUID + FK, add missing allmaps_id + legend columns
--   2. label_pins: add missing data JSONB column
--   3. footprint_submissions: rename label → name, add category, auto-link map_id via trigger

-- ── A. label_tasks: fix map_id type, add FK, add missing columns ──────────

-- Cast map_id TEXT → UUID (both existing rows are valid UUIDs)
ALTER TABLE label_tasks
  ALTER COLUMN map_id TYPE UUID USING map_id::uuid;

-- Add referential integrity to maps (skip if already exists)
DO $$ BEGIN
  ALTER TABLE label_tasks
    ADD CONSTRAINT label_tasks_map_id_fkey
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add columns used in code but absent from migration 008
ALTER TABLE label_tasks
  ADD COLUMN IF NOT EXISTS allmaps_id TEXT,
  ADD COLUMN IF NOT EXISTS legend     JSONB;

-- Rebuild index now that column type changed
DROP INDEX IF EXISTS idx_label_tasks_map;
CREATE INDEX idx_label_tasks_map ON label_tasks(map_id);

-- ── B. label_pins: add missing data column ────────────────────────────────

-- Stores vietnameseName, notes, originalName etc. used in LabelStudio UI
ALTER TABLE label_pins
  ADD COLUMN IF NOT EXISTS data JSONB;

-- ── C. footprint_submissions: rename label → name ─────────────────────────

-- "label" conflated two things: a human-readable name ("Building 1") and a
-- legend classification ("Temple"). Rename to name; add category separately.
ALTER TABLE footprint_submissions
  RENAME COLUMN label TO name;

-- ── D1. footprint_submissions: extend feature_type to include green_space + water_body ─

ALTER TABLE footprint_submissions
  DROP CONSTRAINT IF EXISTS footprint_submissions_feature_type_check;

ALTER TABLE footprint_submissions
  ADD CONSTRAINT footprint_submissions_feature_type_check
    CHECK (feature_type IN ('building', 'land_plot', 'road', 'waterway', 'green_space', 'water_body', 'other'));

-- ── D2. footprint_submissions: add category ────────────────────────────────

-- Stores the legend-based classification (e.g. "particulier", "Temple",
-- "Market"). Populated from the associated label_pin's label on insert,
-- or from SAM color class for sam-auto rows.
ALTER TABLE footprint_submissions
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_footprints_category
  ON footprint_submissions(category)
  WHERE category IS NOT NULL;

-- ── E. Trigger: auto-populate map_id from parent label_tasks on insert ────

-- Volunteer inserts don't pass map_id directly; they pass task_id.
-- This trigger copies the parent task's map_id so footprints are always
-- linkable to a map without requiring the caller to do the join.
CREATE OR REPLACE FUNCTION populate_footprint_map_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.map_id IS NULL AND NEW.task_id IS NOT NULL THEN
    SELECT map_id INTO NEW.map_id
    FROM label_tasks
    WHERE id = NEW.task_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_footprint_map_id ON footprint_submissions;

CREATE TRIGGER trg_footprint_map_id
  BEFORE INSERT ON footprint_submissions
  FOR EACH ROW EXECUTE FUNCTION populate_footprint_map_id();

-- ── F. Backfill: populate map_id for the 46 existing volunteer rows ───────

UPDATE footprint_submissions fs
SET    map_id = lt.map_id
FROM   label_tasks lt
WHERE  fs.task_id = lt.id
  AND  fs.map_id  IS NULL
  AND  lt.map_id  IS NOT NULL;

-- ── G. Backfill: parse "Name - Category" into name + canonical category ───
--
-- Volunteers wrote labels in two patterns:
--   "Marche Central - Communal"  → name="Marche Central", category="communal"
--   "Private"                    → name=null, category="particulier"
--
-- Canonical category mapping (matches SAM color pipeline):
--   Private       → particulier
--   Communal      → communal
--   Military      → militaire
--   Service       → local_svc
--   Local Service → local_svc
--   Non-usage     → non_affect
--   Park          → non_affect

-- Helper: map raw category text → canonical value
CREATE OR REPLACE FUNCTION canonicalise_category(raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE UPPER(TRIM(raw))
    WHEN 'PRIVATE'       THEN 'particulier'
    WHEN 'COMMUNAL'      THEN 'communal'
    WHEN 'MILITARY'      THEN 'militaire'
    WHEN 'SERVICE'       THEN 'local_svc'
    WHEN 'LOCAL SERVICE' THEN 'local_svc'
    WHEN 'NON-USAGE'     THEN 'non_affect'
    WHEN 'PARK'          THEN 'non_affect'
    ELSE LOWER(TRIM(raw))
  END;
$$;

-- Pattern 1: "Name - Category" → split on last " - "
-- Use reverse + strpos trick to split on last occurrence so names like
-- "Hotel du Directeur de - Service" split correctly.
UPDATE footprint_submissions
SET
  name     = TRIM(LEFT(name, LENGTH(name) - STRPOS(REVERSE(name), ' - ') - 1)),
  category = canonicalise_category(
               TRIM(RIGHT(name, STRPOS(REVERSE(name), ' - ') - 1))
             )
WHERE name LIKE '% - %'
  AND category IS NULL;

-- Pattern 2: name IS exactly a known category keyword
UPDATE footprint_submissions
SET
  name     = NULL,
  category = canonicalise_category(name)
WHERE category IS NULL
  AND UPPER(TRIM(name)) IN (
        'PRIVATE', 'COMMUNAL', 'MILITARY',
        'SERVICE', 'LOCAL SERVICE', 'NON-USAGE', 'PARK'
      );

-- ── H. Backfill: fix feature_type for misclassified road/water rows ───────

-- "Water" rows classified as "other" → waterway
UPDATE footprint_submissions
SET feature_type = 'waterway'
WHERE feature_type = 'other'
  AND LOWER(TRIM(name)) = 'water';

-- "Rue …" / "Boulevard …" rows classified as "other" → road
UPDATE footprint_submissions
SET feature_type = 'road'
WHERE feature_type = 'other'
  AND (name ILIKE 'Rue %' OR name ILIKE 'Boulevard %');
