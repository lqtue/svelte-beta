-- Pipeline sheets: tracks each map through the download → IA → annotate → georef pipeline

CREATE TABLE IF NOT EXISTS pipeline_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  series      TEXT NOT NULL DEFAULT 'L7014-Vietnam',
  sheet_number TEXT NOT NULL,          -- e.g. '6431-3'
  sheet_name   TEXT,                   -- e.g. 'Loc Ninh'

  -- Source download URL (VVA Texas Tech)
  source_url TEXT,

  -- Grid position for neighbour lookup (computed from sheet index order)
  grid_col INT,
  grid_row INT,

  -- Geographic bounds in Indian 1960 datum (degrees, from UT Austin index)
  ind60_sw_lat DOUBLE PRECISION,
  ind60_sw_lon DOUBLE PRECISION,
  ind60_ne_lat DOUBLE PRECISION,
  ind60_ne_lon DOUBLE PRECISION,

  -- Internet Archive
  ia_identifier TEXT,
  ia_iiif_base  TEXT,                  -- e.g. https://iiif.archive.org/iiif/3/vma-vietnam-6431-3%2F6431-3.jpg
  ia_status     TEXT NOT NULL DEFAULT 'pending'
                CHECK (ia_status IN ('pending','uploading','done','error','skip')),
  ia_error      TEXT,
  ia_done_at    TIMESTAMPTZ,

  -- Annotation (stored in Supabase Storage)
  annotation_url    TEXT,
  annotation_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (annotation_status IN ('pending','iiif_wait','done','error')),
  annotation_error  TEXT,

  -- Georef
  is_seed           BOOLEAN NOT NULL DEFAULT FALSE,
  georef_status     TEXT NOT NULL DEFAULT 'pending'
                    CHECK (georef_status IN ('pending','seed_ready','seed_done','propagated','error')),
  georef_source_id  UUID REFERENCES pipeline_sheets(id) ON DELETE SET NULL,

  -- Linked map row (created when annotation is done)
  map_id UUID REFERENCES maps(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (series, sheet_number)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_grid     ON pipeline_sheets(series, grid_row, grid_col);
CREATE INDEX IF NOT EXISTS idx_pipeline_ia       ON pipeline_sheets(ia_status);
CREATE INDEX IF NOT EXISTS idx_pipeline_ann      ON pipeline_sheets(annotation_status);
CREATE INDEX IF NOT EXISTS idx_pipeline_georef   ON pipeline_sheets(georef_status);
CREATE INDEX IF NOT EXISTS idx_pipeline_seed     ON pipeline_sheets(is_seed) WHERE is_seed = TRUE;

ALTER TABLE pipeline_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_admin_all" ON pipeline_sheets USING (true) WITH CHECK (true);
