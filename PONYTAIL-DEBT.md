# Ponytail debt ledger

Deliberate shortcuts marked with `ponytail:` comments. Each names its ceiling
and the trigger to revisit. Regenerate: `/ponytail-debt`.

## tests/smoke.spec.ts
- **:15** — read-only smokes only. ceiling: two write paths (OCR bbox save, footprint submit) uncovered. upgrade: seed a test project with auth.

## work/ocr/scripts/ocr.py
- **:688** — two same-text features on one tile collapse to one row (shared unique key). ceiling: distinct same-text features lost. upgrade: add location suffix to key if it bites.

## scripts/check-bundle.mjs
- **:9** — regex over emitted JS, not a real module graph. ceiling: assumes plain quoted import specifiers. upgrade: parse with es-module-lexer if bundler emits computed specifiers.

## playwright.config.ts
- **:3** — chromium only, no fixtures/global setup. ceiling: no firefox/webkit. upgrade: add projects when a browser-specific bug shows.

## src/routes/(app)/explore/+page.svelte
- **:253** — mirrors topmost overlay only into `?map=`. ceiling: single-id reader, not full stack. upgrade: when multi-map stack sharing is asked for.
- **:286** — fire-and-forget open-tally. ceiling: dropped tally only warns. upgrade: *none* — `no-trigger`.

## src/routes/api/admin/maps/[id]/ocr/+server.ts
- **:88** — `node:` prefix on builtins for CF Pages bundle. ceiling: none named. upgrade: *none* — `no-trigger`.

## work/ocr/scripts/join_labels.py
- **:77** — ray-cast PIP + O(labels × footprints) scan. ceiling: one map (hundreds each). upgrade: grid-bucket footprints if a map holds tens of thousands.

## work/ocr/scripts/eval_metrics.py
- **:48** — char-acc via difflib SequenceMatcher.ratio() (2·M/T similarity), not true CharACC/CER. ceiling: tracks regressions, not an exact CER. upgrade: rapidfuzz normalized_similarity if exact CER needed.

---
**9 markers, 2 with no trigger.**
