# VMA Database Design Guidelines

This document is the canonical reference for schema decisions. All migrations must follow these rules. Deviations require a comment in the migration explaining why.

---

## 1. Identifiers

### Primary key
Every table has exactly one PK:
```sql
id uuid primary key default gen_random_uuid()
```

### Canonical map identifier
`maps.id` (UUID) is the single canonical reference to a map. Use it everywhere.

`maps.allmaps_id` is a **service credential** — the Allmaps API key for this map's annotation. It is only used when calling Allmaps endpoints (building annotation URLs, loading warped tile layers). It is never a join key or URL parameter.

Resolved (Aug 2026): `mapStore.activeMapId` now holds the `maps.id` UUID, mirrored from `layersStore.topOverlay`; the map deep-link is the `?map=<uuid>` query param, and the `&map=` hash writer is gone. The old `supabase/maps.ts` shim was deleted — read through `src/lib/data/maps/service.ts`.

### Foreign keys
All FK columns reference the PK (`id uuid`). Text pseudo-FKs are not permitted.

```sql
-- correct
map_id uuid not null references public.maps(id) on delete cascade

-- forbidden
map_id text   -- no FK, no integrity
allmaps_id text  -- service credential used as join key
```

---

## 2. Naming

| Concept | Column name | Example |
|---------|------------|---------|
| Primary key | `id` | `id uuid primary key` |
| Foreign key | `{table_singular}_id` | `map_id`, `story_id`, `run_id` |
| User identity | `user_id` | `user_id uuid references auth.users` |
| Boolean flag | `is_{state}` | `is_featured`, `is_public`, `is_primary` |
| Creation time | `created_at` | `created_at timestamptz default now()` |
| Mutation time | `updated_at` | see § 4 |
| Status lifecycle | `status` | `status text check (...)` |

Never use `submitted_by`, `author_id`, `owner_id` — always `user_id`.

Table names are plural snake_case matching the domain, not the feature that happens to use them (`maps`, `footprint_submissions`, `story_points` — not `hunts`, which was dropped in migration 034 when the feature was renamed).

---

## 3. Required columns

Every table must have:
```sql
id         uuid primary key default gen_random_uuid()
created_at timestamptz default now()
```

Tables where rows are mutated after insert (status changes, edits) must also have:
```sql
updated_at timestamptz default now()
```
…with an auto-update trigger (see § 4).

---

## 4. Auto-update trigger pattern

Use a shared trigger function per table. Name it `{table}_set_updated_at`:

```sql
create or replace function public.{table}_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger {table}_updated_at
  before update on public.{table}
  for each row execute function public.{table}_set_updated_at();
```

---

## 5. Status fields

Use `text` with a `CHECK` constraint. Never use Postgres enums (hard to add values).

```sql
status text not null default 'open'
  check (status in ('open', 'in_progress', 'approved', 'rejected'))
```

Always add a comment documenting valid transitions:
```sql
comment on column public.{table}.status is
  'Lifecycle: open → in_progress → approved | rejected';
```

---

## 6. User roles

Valid values for `profiles.role`: `'admin'`, `'mod'`, `null` (default).

- `admin` — full write access, publish maps, manage users
- `mod` — approve/reject footprints, enrich catalog metadata
- `null` — default for any authenticated user; can label, georeference, submit footprints

The CHECK constraint on `profiles.role` must reflect all valid values. (`cataloger` was renamed to `mod` in migration 038.)

---

## 7. Denormalization policy

Denormalized columns are only permitted when:
1. The source of truth is in another table
2. A trigger keeps the copy in sync
3. Both the column and the trigger have SQL comments documenting the relationship

Example: `maps.iiif_image` is a cache of the primary `map_iiif_sources` row, synced by `sync_primary_iiif_to_map` trigger.

Never denormalize FKs. If you need `maps.allmaps_id` in a child table, join through `map_id → maps.allmaps_id` at read time.

---

## 8. JSONB columns

Use JSONB for:
- Flexible metadata where keys are user-defined (`extra_metadata jsonb default '{}'`)
- GeoJSON geometry (`pixel_polygon`, `features`)
- Configuration objects with fixed structure (`challenge`, `camera`)

Do not use JSONB for data that needs to be filtered, sorted, or indexed — give those fields their own columns.

Always default to `'{}'` (objects) or `'[]'` (arrays), never `null`.

---

## 9. RLS patterns

All tables must have `alter table ... enable row level security`.

| Access | Policy pattern |
|--------|---------------|
| Public read | `using (true)` |
| Own rows | `using (auth.uid() = user_id)` |
| Admin write | `using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))` |
| Automated pipeline (service key, no auth.uid) | `with check (user_id is null)` |

---

## 10. Migration hygiene

- One concern per file. Schema change + its data backfill belong together; unrelated changes go in separate files.
- Always use `if not exists` / `if exists` / `or replace` on all DDL.
- Never amend a pushed migration. Add a new one.
- Number files as `NNN_short_description.sql`. Gaps in numbering are fine.
- After dropping a column or table, delete or stub the corresponding TypeScript types in the same PR.
- **Never change schema in the Dashboard SQL Editor.** An object edited there is invisible to `supabase/migrations/`, and the cost lands on whoever writes the next migration that rebuilds it, not on whoever made the edit. Learned on 070: production's `pipeline_jobs_kind_check` had been widened by hand to allow `warp`, no migration recorded it, and 070 rebuilt the list from the migrations — dropping a kind that was in use and failing on existing rows (`check constraint "pipeline_jobs_kind_check" ... is violated by some row`). It rolled back cleanly, but only because a check constraint is the *gentle* version of this: the same mistake on a policy or a trigger silently removes protection instead of refusing. If a hotfix in the Dashboard is genuinely unavoidable, write the matching migration the same day.
- A migration that rebuilds an enumerated constraint should therefore assert against reality first, not against the previous migration: `select distinct kind from pipeline_jobs` costs nothing and would have caught this.

---

## 11. Current schema (migration head 071)

Moved here from `CLAUDE.md` in September 2026. The table lists what exists; the paragraphs after it are the rules a migration must not undo.

| Table | Purpose | Notes |
|-------|---------|-------|
| `maps` | Map catalogue | `id` (uuid), `allmaps_id`, `annotation_url` (mig 047), `iiif_image`, `iiif_manifest`, `source_type`, `holding_institution` (mig 044), `collection`, `map_type`, `bbox`, `status`, `thumbnail`, full DC fields, plus `georef_done`, `help_needed`, `legend_done`, `priority`, `label_config`, `triage` (mig 069, `regions` added by 070) |
| `profiles` | Per-user role | `user`, `mod`, `admin`; read via `fetchUserRole` |
| `scout_candidates` | External discoveries (mig 045) | `source`, `external_id` (unique with source), `manifest_url`, `score`, `category`, `status` (`pending/approved/rejected/ingested`), `map_id` on ingest, `raw` JSONB |
| `map_iiif_sources` | Multiple IIIF sources per map | `map_id → maps.id`, `source_type`, `is_primary`, `sort_order`. Partial unique index = one primary per map; trigger syncs primary to `maps.iiif_image` |
| `map_opens` | Per-map open tally (mig 049) | Fire-and-forget insert from /explore |
| `label_pins` | Point annotations | `map_id → maps.id`, pixel coords. `label_tasks` was dropped in mig 038 |
| `footprint_submissions` | Polygon traces + SAM2 output | `map_id → maps.id`; status ∈ `draft/submitted/needs_review/approved/rejected`, source ∈ `volunteer/sam-auto/sam-corrected/import` (both widened in mig 055 — 038's lists rejected every SAM2 write); `pixel_polygon`; `run_id` (mig 057) pins a segmentation run so the OCR join cannot mix runs |
| `annotation_sets` | User GeoJSON | `map_id → maps.id` nullable, `user_id → auth.users` |
| `ocr_extractions` | OCR bbox results | `(map_id, run_id, tile_x, tile_y, text)` unique; `global_*` are full-image px; `status` ∈ `pending/validated/rejected`; `footprint_id` (mig 050) is the OCR↔footprint join. Read policy inherits the map's gate since mig 065 (published, or any signed-in user) |
| `pipeline_jobs` | Work queue between web and workers (mig 053) | `kind` (10 values incl. `join` mig 061, `layout` mig 070) · `status` (`queued/claimed/running/done/failed/cancelled`) · `payload` jsonb · retry via `attempts < max_attempts`. Partial unique index = one live job per (kind, map). Service-role only. Claim/close with the `claim_job` / `finish_job` RPCs |
| `worker_keys` | Per-machine revocable worker credentials (mig 053) | `token_hash` (sha256), `kinds`, `revoked_at`. Written in step 2; the table exists now |
| `map_pipeline_status` | Per-map pipeline state — **a view since mig 056** | Machine stages derived from `pipeline_jobs`, human stages from `map_review_marks`. Read-only; nothing writes it |
| `map_review_marks` | The three stages a person asserts (mig 056) | `reviewed_at`, `seg_reviewed_at`, `exported_at`. Written only by the `set_review_mark` RPC |
| `stories`, `story_points`, `story_progress` | Stories/tours | `hunts` / `hunt_stops` were dropped in mig 034. Since mig 059 a story has `status` (`draft/submitted/approved/rejected`) + `reviewed_by`/`reviewed_at`, and **`is_public` is gone** — publishing submits for review, and only `approved` is publicly readable |
| `user_favorites` | Saved maps | via `data/supabase/favorites.ts` |
| `legend_submissions`, `map_help_requests`, `metadata_submissions` | Community contributions | write paths only; no dedicated UI review screen yet |

`maps.status` (mig 038): `draft | public | featured`. Inserts default to `draft`. The older `pending_georef → georeferenced → processing → published` values fail `maps_status_check`.

**Status transitions live in Postgres** (mig 054), not in the API: `set_extraction_status(status, user, ids?, map_id?, run_id?)` applies the `validated_at`/`validated_by` stamp, `revert_recent_validations(map_id, user, window_mins)` undoes one reviewer's recent work, and `set_footprint_status(id, status, user, …)` moves a polygon out of `needs_review` exactly once and marks a reshaped one `sam-corrected`; `set_review_mark(map_id, stage, user)` (mig 056) records a human pipeline stage. With `claim_job`/`finish_job` (mig 053) these are the write paths the API, the workers and any future direct client all share. All are `security definer`, granted to `service_role` only.

**One visibility model on `maps`** (mig 060): the `status` enum. `is_public` / `is_featured` were dropped and the four RLS policies that read them rewritten onto `status`. The only `is_public` left is `annotation_sets.is_public`, a per-user sharing flag, not map visibility. Do not add a second model.

`source_type` (mig 027, extended by mig 041): `ia | bnf | efeo | gallica | rumsey | self | other | r2`.

**Draft maps are not anonymously readable** (mig 063): `maps_select_all … using (true)` had stood since migration 001, so the publishable key — which ships in every client bundle — returned every draft row. The gate is authentication, not role: `status in ('public','featured') or auth.uid() is not null`. Restricting to admin/mod would break open contribution, because `fetchGeorefQueue` selects drafts by status and the digitalize/trace pickers are mostly unpublished maps. Covered by a write smoke that fails against the old policy.

**A published map must be georeferenceable** (mig 062): `status in ('public','featured')` requires `annotation_url` **or** `allmaps_id`. Not `annotation_url NOT NULL` as originally planned — that deadlocks, since publishing is what enqueues `mirror_annotation`. Full self-hosting is the queue's job, not the constraint's.

**Publishing enqueues hosting work** (mig 058): moving a map to `public`/`featured` fires `enqueue_publish_jobs()`, which queues `mirror_annotation` (when `annotation_url` is null) and `tile_to_r2` (when `source_type` isn't already `r2`). `on conflict do nothing` rides the one-live-job index, so re-publishing never duplicates. Since 2026-09-06 the worker claims both by default (`tile_to_r2` only where vips + rclone are installed), so a worker left running finishes what publishing starts; `annotation_url NOT NULL` for public maps waits until that has proven itself over a few publishes.

**Full-text search** (mig 046): both `maps` and `scout_candidates` have a `search_vector tsvector GENERATED STORED` column + GIN index. `simple` config (not `english`) is intentional — the corpus is multilingual French/Vietnamese/English. Query via `.textSearch('search_vector', q, { config: 'simple', type: 'plain' })`.

---

## Current known debt

| Item | Location | Fix |
|------|---------|-----|
| `label_pins` outlives its feature | `label_tasks` was dropped in mig 038 but `label_pins` remains, now written only by `POST /api/admin/maps/[id]/ocr/apply` | Either fold into `ocr_extractions` or document it as the OCR-applied point layer |
| Migration head is 071 | `supabase/migrations/` | Regenerate `src/lib/data/supabase/types.ts` after every push: `supabase gen types typescript --linked` |
| Production drifted from the migrations once | `pipeline_jobs_kind_check` allowed `warp` with no migration saying so; corrected in 070 | Nothing to fix now — but it means the migrations are not provably the whole schema. A `db pull` diff would settle it, and needs the direct DB password |
