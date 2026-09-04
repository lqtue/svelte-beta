-- Migration 069 — the saved triage: neatline + tile grid + per-tile priority
--
-- `/contribute/digitalize` has always kept triage in localStorage
-- (`digitalize-triage-<mapId>`, see `triagePrefs.ts`), which survives a closed
-- tab but is invisible to anything server-side. That is fine while triage and
-- OCR happen in one sitting, and it is the wrong shape for the workflow this
-- column exists to serve: a person triages a batch of sheets over an evening,
-- checks what they did, and only then queues the runs.
-- `scripts/enqueue_ocr_all.mjs` runs on a server and cannot read a browser.
--
-- Shape matches what `POST /api/admin/maps/[id]/ocr` already takes, so the
-- enqueue script can spread it into a job payload with no translation:
--   { neatline: [x, y, w, h], tile_size, overlap, tile_overrides: {"x_y_w_h": "skip"|"low_res"},
--     saved_at, saved_by }
--
-- Not a separate table: it is at most one row per map, it is overwritten rather
-- than accumulated, and every reader already holds the map.
--
-- jsonb, not typed columns, for the same reason `label_config` is: the tile
-- grid is a sparse map keyed by pixel geometry, and pinning it into columns
-- would force a migration every time the triage UI grows a control.

alter table public.maps
  add column if not exists triage jsonb not null default '{}';

comment on column public.maps.triage is
  'Saved OCR triage: { neatline, tile_size, overlap, tile_overrides, saved_at, saved_by }. Written by /contribute/digitalize, read by scripts/enqueue_ocr_all.mjs. Empty object = never triaged.';

-- Partial: the whole point of the index is "which sheets are ready to queue?",
-- and the untriaged majority is exactly what it should not carry.
create index if not exists idx_maps_triaged
  on public.maps ((triage->'neatline'))
  where triage ? 'neatline';
