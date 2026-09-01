# Ponytail debt ledger

Deliberate shortcuts marked with `ponytail:` comments. Each names its ceiling
and the trigger to revisit. Regenerate: `/ponytail-debt`. Never hand-edit.

## src/lib/core/utils/id.ts

- **:4** — `randomId()` calls `crypto.randomUUID()` with no fallback. ceiling: needs a secure context — true for localhost dev, HTTPS prod and Cloudflare Workers. upgrade: add a `Math.random` fallback only if this ever has to run over plain http on a LAN address.

## src/lib/features/explore/exploreUrl.ts

- **:38** — `syncMapParam` mirrors only the topmost overlay into `?map=`, not the whole stack. ceiling: `applyExploreUrlParams()` reads a single id, so a stack encoding needs a reader change too. upgrade: when sharing multi-map stacks is asked for.

## src/routes/api/admin/maps/[id]/ocr/+server.ts

- **:80** — `node:` prefix on builtins so the Cloudflare Pages Functions bundle step can resolve them. ceiling: none named. upgrade: _none_ — `no-trigger`.

## scripts/check-bundle.mjs

- **:9** — regex over the emitted JS, not a real module graph. ceiling: assumes plain quoted import specifiers, which built output always emits. upgrade: parse with `es-module-lexer` if a future bundler emits computed specifiers.

## eslint.config.js

- **:16** — `@typescript-eslint/no-explicit-any` is off. ceiling: ~25 `as any` casts survive the Aug-2026 cleanup, tracked as debt rather than a lint failure. upgrade: pass `<Database>` to every `createClient(...)`, then flip the rule to `warn`.

## tests/smoke.spec.ts

- **:15** — read-only smokes against the dev server and the real Supabase project. ceiling: the two write paths worth covering — saving an OCR bbox and submitting a footprint — need a logged-in user and would insert into production tables. upgrade: seed a test project with auth.

## playwright.config.ts

- **:3** — chromium only, no fixtures, no global setup. ceiling: no firefox/webkit coverage. upgrade: add projects when a browser-specific bug actually shows up.

## work/ocr/scripts/ocr.py

- **:704** — two distinct same-text features on one tile collapse to one DB row (shared unique key). ceiling: distinct same-text features are lost. upgrade: add a location suffix to the key if it ever bites.
- **:2152** — `_write_legend_rows` stores the legend number + grid in `notes` (parseable `n=..; grid=..`) because `ocr_extractions` has no columns for them. ceiling: keeps the row key unique and carries the body-numeral join key. upgrade: add real columns if the number-join gets clumsy.

## work/ocr/scripts/join_labels.py

- **:77** — ray-cast point-in-polygon plus an O(labels × footprints) scan. ceiling: fine for one map (hundreds of each). upgrade: grid-bucket the footprints if a map ever holds tens of thousands.

## work/ocr/scripts/local_vision.py

- **:16** — pure scipy + Tesseract, chosen because cv2/PaddleOCR have no clean Python 3.14 wheel today. ceiling: digit recall. upgrade: swap `spot_numerals()` for a PaddleOCR detector in a 3.11 venv; keep the `[{text, bbox, confidence}]` return shape and nothing downstream changes.

## work/ocr/scripts/eval_metrics.py

- **:48** — char-accuracy via `difflib.SequenceMatcher.ratio()` (a 2·M/T similarity), not a true CharACC/CER. ceiling: tracks regressions, is not an exact CER. upgrade: `rapidfuzz` `normalized_similarity` if an exact CER is ever needed.

---

**12 markers, 1 with no trigger.**
