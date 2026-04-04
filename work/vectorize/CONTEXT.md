# Vectorization — Active Work Context

## What This Is

SAM2-based pipeline that extracts georeferenced building footprints and land-use parcels from French colonial cadastral maps of Saigon (1882, 1898). The extracted polygons feed the VMA 6-layer data stack as **L1** (macro signal).

**Status**: In active development. 1882 map dry-run done; full run and 1898 map pending.

---

## Key Files

| Location | Purpose |
|----------|---------|
| `scripts/vectorize/` | Python package — SAM2 pipeline (entry: `scripts/vectorize.py`) |
| `src/lib/contribute/review/` | HITL review UI — ReviewMode, ReviewCanvas, ReviewSidebar |
| `src/routes/contribute/review/` | SvelteKit route for HITL review |
| `src/routes/api/admin/footprints/` | GET/PATCH API for pending footprints |
| `supabase/migrations/019_needs_review_status.sql` | Adds `needs_review` status + index |
| `work/vectorize/todo.md` | Detailed step-by-step task list |
| `work/vectorize/methodology.md` | Full technical methodology + paper framing |
| `work/vectorize/mapkurator-reference.md` | MapKurator reference (text extraction, KG integration path) |
| `work/vectorize/outputs/` | Local dry-run outputs — JSON + preview PNGs (gitignored) |

---

## Architecture Summary

- **Input**: IIIF tiles from Internet Archive (1882: `vma-map-0e02b9d9-...`)
- **SAM2 mode**: `SAM2AutomaticMaskGenerator` (grid scan) for full passes; `SAM2ImagePredictor` (guided box prompts) when `--seeds` provided
- **Two-phase run**: `plot` pass (4096px tiles → city blocks) then `building` pass (1024/512px tiles → individual footprints)
- **Color filter**: 5-class RGB palette (`particulier`, `communal`, `militaire`, `local_svc`, `non_affect`); dynamic EMA adaptation per tile
- **Hatched parcels** (`militaire`, `local_svc`): classified correctly, flagged `needs_review` → routed to HITL review UI
- **Output**: GeoJSON polygons inserted into Supabase `footprints` table with `map_id`, `class`, `status`, `pixel_coords`

## HITL Review Flow

1. Vectorize run flags hatched parcels as `needs_review`
2. Reviewer opens `/contribute/review`
3. `ReviewMode` fetches pending footprints via `GET /api/admin/footprints`
4. `ReviewCanvas` renders polygons overlaid on the georef map
5. Reviewer approves (`submitted`) or rejects (`rejected`) via `ReviewSidebar`
6. `PATCH /api/admin/footprints` updates status (only `needs_review → submitted/rejected` transitions allowed)

---

## Current Status

- [x] SAM2 pipeline modularized (`scripts/vectorize/`)
- [x] HITL review UI built (`src/lib/contribute/review/`)
- [x] API routes for footprint review
- [x] DB migration (`019_needs_review_status.sql`) written
- [ ] Apply migrations to Supabase (see todo.md §1)
- [ ] Full 1882 plot pass run
- [ ] Full 1882 building pass run
- [ ] 1898 map prep + georef
- [ ] Full 1898 vectorization
- [ ] Vector-to-vector georef (1882→1898 temporal change detection)

---

## Next Step

See `work/vectorize/todo.md` for exact commands.
Immediate: apply migrations, then run 1882 plot pass dry-run.
