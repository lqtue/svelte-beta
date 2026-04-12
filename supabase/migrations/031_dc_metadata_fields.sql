-- Add Dublin Core metadata fields to maps table.
-- Existing columns map to DC elements as follows:
--   original_title  → dc:title
--   creator         → dc:creator
--   year_label      → dc:date
--   shelfmark       → dc:identifier
--   source_url      → dc:source
--   rights          → dc:rights
--   language        → dc:language
--   physical_description → dc:format
--
-- New columns for the remaining useful DC elements:
alter table maps
  add column if not exists dc_description text,   -- dc:description  (abstract / content summary)
  add column if not exists dc_subject     text,   -- dc:subject      (keywords, comma-separated)
  add column if not exists dc_publisher   text,   -- dc:publisher    (institution that published the map)
  add column if not exists dc_coverage    text;   -- dc:coverage     (spatial / temporal coverage)
