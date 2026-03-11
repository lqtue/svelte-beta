-- Add feature_type to footprint_submissions.
-- Distinguishes building footprints (polygon), land plots (polygon),
-- roads (linestring), and waterways (linestring).
-- pixel_polygon stores [[x,y],...] for all types — closed ring for areas,
-- open sequence for lines.

ALTER TABLE footprint_submissions
  ADD COLUMN IF NOT EXISTS feature_type TEXT NOT NULL DEFAULT 'building'
    CHECK (feature_type IN ('building', 'land_plot', 'road', 'waterway', 'other'));
