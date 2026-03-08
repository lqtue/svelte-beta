-- Add UT Austin GeoPDF tracking columns to pipeline_sheets

ALTER TABLE pipeline_sheets
  -- Direct PDF URL from UT Austin (e.g. https://maps.lib.utexas.edu/maps/topo/vietnam/tay_ninh-6231-4.pdf)
  ADD COLUMN IF NOT EXISTS ut_pdf_url TEXT,

  -- WGS84 corners extracted from the GeoPDF via GDAL (EPSG:3148 → EPSG:4326)
  -- These are ground-truth; preferred over ind60_* Helmert-approximated values.
  ADD COLUMN IF NOT EXISTS wgs84_sw_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS wgs84_sw_lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS wgs84_ne_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS wgs84_ne_lon DOUBLE PRECISION,

  -- Neatline polygon in pixel space (SVG points string "x1,y1 x2,y2 ...")
  -- Extracted from GeoPDF NEATLINE metadata via GDAL inverse geotransform.
  -- Used as the SvgSelector polygon in the Allmaps annotation to clip map margins.
  ADD COLUMN IF NOT EXISTS neatline_pixels TEXT,

  -- PDF processing status
  ADD COLUMN IF NOT EXISTS pdf_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (pdf_status IN ('pending','no_pdf','done','error')),
  ADD COLUMN IF NOT EXISTS pdf_error TEXT;

CREATE INDEX IF NOT EXISTS idx_pipeline_pdf ON pipeline_sheets(pdf_status);
