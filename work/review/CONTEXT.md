# HITL Review — Active Work Context

## What This Is

Human-in-the-loop review interface for SAM2-generated polygons flagged `needs_review`. These are hatched parcels (`militaire`, `local_svc`) that the color classifier cannot confidently auto-approve due to hatching patterns overlapping multiple color classes.

**Status**: UI and API built; pending migration apply and integration test.

**Note**: This feature is part of the vectorization pipeline. See `work/vectorize/CONTEXT.md` for the full picture.

---

## Key Files

| Location | Purpose |
|----------|---------|
| `src/lib/contribute/review/ReviewMode.svelte` | Orchestrator — fetches footprints, manages state |
| `src/lib/contribute/review/ReviewCanvas.svelte` | Polygon rendering overlaid on OL map |
| `src/lib/contribute/review/ReviewSidebar.svelte` | Approve / reject actions + keyboard shortcuts |
| `src/routes/contribute/review/+page.svelte` | SvelteKit page |
| `src/routes/contribute/review/+page.ts` | Load function |
| `src/routes/api/admin/footprints/+server.ts` | GET (fetch pending) + PATCH (update status) |
| `src/lib/supabase/labels.ts` | `fetchNeedsReviewFootprints()`, `fetchMapsWithPendingReview()` |
| `supabase/migrations/019_needs_review_status.sql` | Adds `needs_review` status value + index |

---

## API Contract

- `GET /api/admin/footprints?map_id=<uuid>` — returns footprints with `status = needs_review`
- `PATCH /api/admin/footprints` — body `{ id, status }` where status is `submitted` or `rejected`
  - Only allows transition from `needs_review`; rejects other statuses with 400

---

## Pending

- [ ] Apply migration `019_needs_review_status.sql`
- [ ] Integration test: run vectorize on a crop, check `needs_review` rows appear, open `/contribute/review`, approve/reject
- [ ] Add route to nav (once stable)
