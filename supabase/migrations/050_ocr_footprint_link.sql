-- Level-aware label ↔ footprint join.
-- Links an OCR extraction (a label read off the map) to the segmented polygon
-- it names, so a footprint carries its name and a label carries its geometry.
-- Nullable: most extractions (titles, legend text, orphan numerals) never link,
-- and a footprint may exist before its label is read. on delete set null so
-- re-running the seg pass (which replaces footprints) never drops extractions.

ALTER TABLE ocr_extractions
  ADD COLUMN IF NOT EXISTS footprint_id UUID
    REFERENCES footprint_submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ocr_extractions_footprint
  ON ocr_extractions(footprint_id)
  WHERE footprint_id IS NOT NULL;
