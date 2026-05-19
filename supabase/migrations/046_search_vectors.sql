-- Migration 046: Full-text search vectors for unified catalog search.
-- Powers /api/search across maps + scout_candidates.
--
-- 'simple' config (not 'english') because the corpus is multilingual
-- (French / Vietnamese / English) and we want lexeme matching without
-- aggressive stemming that would mangle proper nouns and Vietnamese tones.

-- ---------- maps.search_vector ----------
ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name, '') || ' ' ||
      coalesce(original_title, '') || ' ' ||
      coalesce(creator, '') || ' ' ||
      coalesce(dc_publisher, '') || ' ' ||
      coalesce(holding_institution, '') || ' ' ||
      coalesce(collection, '') || ' ' ||
      coalesce(location, '') || ' ' ||
      coalesce(dc_coverage, '') || ' ' ||
      coalesce(dc_subject, '') || ' ' ||
      coalesce(shelfmark, '') || ' ' ||
      coalesce(year_label, '') || ' ' ||
      coalesce(year::text, '') || ' ' ||
      coalesce(extra_metadata->>'sheet_number', '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_maps_search_vector ON maps USING gin (search_vector);

-- ---------- scout_candidates.search_vector ----------
ALTER TABLE scout_candidates
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '') || ' ' ||
      coalesce(creator, '') || ' ' ||
      coalesce(publisher, '') || ' ' ||
      coalesce(holding_institution, '') || ' ' ||
      coalesce(collection, '') || ' ' ||
      coalesce(date, '') || ' ' ||
      coalesce(year::text, '') || ' ' ||
      coalesce(raw->>'description', '') || ' ' ||
      coalesce(raw->>'subject', '') || ' ' ||
      coalesce(raw->>'coverage', '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_scout_search_vector ON scout_candidates USING gin (search_vector);
