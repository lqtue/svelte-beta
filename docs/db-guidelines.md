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

## Current known debt

| Item | Location | Fix |
|------|---------|-----|
| Two visibility models on `maps` | the `status` enum (`draft \| public \| featured`, mig 038) and the `is_public` / `is_featured` booleans both exist, and different code paths gate on different ones — `data/maps/georef.ts` selects the georef queue with `.eq('is_public', false)` while `/api/search` enforces `status IN ('public','featured')`, and `MapEditModal` exposes both | Pick one as authoritative, migrate the other to a generated column or drop it. **Do not add a third.** |
| `label_pins` outlives its feature | `label_tasks` was dropped in mig 038 but `label_pins` remains, now written only by `POST /api/admin/maps/[id]/ocr/apply` | Either fold into `ocr_extractions` or document it as the OCR-applied point layer |
| Migration head is 070 | `supabase/migrations/` | Regenerate `src/lib/data/supabase/types.ts` after every push: `supabase gen types typescript --linked` |
| Production drifted from the migrations once | `pipeline_jobs_kind_check` allowed `warp` with no migration saying so; corrected in 070 | Nothing to fix now — but it means the migrations are not provably the whole schema. A `db pull` diff would settle it, and needs the direct DB password |
