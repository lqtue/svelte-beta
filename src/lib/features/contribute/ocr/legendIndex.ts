/**
 * The printed legend as an answer key for the numerals on the map.
 *
 * A sheet with a numbered legend states, in 1942 ink, every number that exists
 * and what it names. The OCR pass writes those two things as separate rows:
 * `legend_entry` for a line of the printed directory (`text: "37. Hôpital
 * Grall"`, `notes: "n=37; grid=B10"`) and `legend_ref` for a numeral spotted on
 * the map body (`text: "37"`). Nothing joins them, so the review table shows a
 * reviewer a bare `37` and no way to tell it from a misread `87`.
 *
 * These are pure functions over rows the sidebar already holds — no fetch, no
 * store. `tests/ocr-suspects.spec.ts` is the check.
 */

import type { OcrExtraction } from '../shared/types';

export type LegendEntry = {
  n: number;
  /** The name with its leading number stripped: "37. Hôpital Grall" → "Hôpital Grall". */
  name: string;
  /** The printed grid cell, "" when the directory does not give one. */
  grid: string;
};

/** A row's category, preferring a human correction over the model's guess. */
function categoryOf(row: OcrExtraction): string {
  return row.category_validated ?? row.category;
}

/** A row's text, preferring a human correction over the model's guess. */
function textOf(row: OcrExtraction): string {
  return row.text_validated ?? row.text ?? '';
}

/**
 * The number a `legend_ref` row claims, or null when its text is not one.
 *
 * The printed numerals are sometimes parenthesised — `(12)` on this sheet's
 * inset references — and the prompt is told to keep the parentheses, so they
 * are stripped here rather than at write time.
 */
export function refValue(text: string): number | null {
  const m = /^\(?\s*(\d{1,3})\s*\)?$/.exec((text ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * Index the `legend_entry` rows by their printed number.
 *
 * The number and grid cell live in `notes` because `ocr_extractions` has no
 * column for either (see `_write_legend_rows` in `work/ocr/scripts/ocr.py`).
 * A row whose notes carry no `n=` is skipped rather than guessed at.
 */
export function legendEntries(rows: OcrExtraction[]): Map<number, LegendEntry> {
  const out = new Map<number, LegendEntry>();
  for (const row of rows) {
    if (categoryOf(row) !== 'legend_entry') continue;
    const n = Number(/\bn=(\d+)/.exec(row.notes ?? '')?.[1]);
    if (!Number.isFinite(n)) continue;
    const grid = (/\bgrid=([^;]*)/.exec(row.notes ?? '')?.[1] ?? '').trim();
    const name = textOf(row)
      .replace(/^\s*\(?\d{1,3}\)?[.\s-]*/, '')
      .trim();
    // First writer wins: a re-read of the same block should not silently
    // replace an entry a person has already corrected.
    if (!out.has(n)) out.set(n, { n, name, grid });
  }
  return out;
}

/** What is wrong with a numeral, in the order a reviewer would want to see it. */
export type SuspectReason =
  /** The text is not a bare number, so it is not a legend reference at all. */
  | 'malformed'
  /** No printed entry carries this number — the sheet's own index says it cannot exist. */
  | 'no-entry'
  /** Another numeral on the sheet claims the same number. */
  | 'duplicate';

/**
 * Flag the numerals worth looking at first, keyed by row id.
 *
 * Three checks, all from the sheet's own printed index and none of them tuned:
 * a reference that is not a number, a number the index does not list, and a
 * number claimed twice. On the 1942 Saigon–Cholon sheet that is ~30 rows out of
 * 176, which is where a reviewer should start rather than at the top.
 *
 * `no-entry` needs the index to have been read: with no `legend_entry` rows the
 * check is skipped entirely, or every numeral on a sheet whose legend nobody
 * has run would be flagged.
 *
 * ponytail: a fourth check — the numeral sitting outside the cell its entry
 * names — needs `maps.triage.grid`, which most sheets do not have yet. Add it
 * beside these when the grid is fitted; `_cell_rect`/`cellBox` already turn a
 * reference into a rectangle.
 */
export function suspectRefs(rows: OcrExtraction[]): Map<string, SuspectReason[]> {
  const entries = legendEntries(rows);
  const refs = rows.filter((r) => categoryOf(r) === 'legend_ref');

  // Counted per run, not across the table. A sheet read twice has every numeral
  // twice, and two passes agreeing is the opposite of a problem — counting them
  // together flagged all 483 numerals on the 1942 sheet the moment its second
  // pass landed. Within one run the paper prints each number once, so a repeat
  // there is the real thing: two marks claiming one number.
  const seen = new Map<string, number>();
  const key = (row: OcrExtraction, v: number) => `${row.run_id ?? ''}#${v}`;
  for (const row of refs) {
    const v = refValue(textOf(row));
    if (v !== null) seen.set(key(row, v), (seen.get(key(row, v)) ?? 0) + 1);
  }

  const out = new Map<string, SuspectReason[]>();
  for (const row of refs) {
    const reasons: SuspectReason[] = [];
    const v = refValue(textOf(row));
    if (v === null) reasons.push('malformed');
    else {
      if (entries.size > 0 && !entries.has(v)) reasons.push('no-entry');
      if ((seen.get(key(row, v)) ?? 0) > 1) reasons.push('duplicate');
    }
    if (reasons.length) out.set(row.id, reasons);
  }
  return out;
}

/** The legend entry a row refers to, for the name shown beside the numeral. */
export function entryForRow(
  row: OcrExtraction,
  entries: Map<number, LegendEntry>
): LegendEntry | null {
  if (categoryOf(row) !== 'legend_ref') return null;
  const v = refValue(textOf(row));
  return v === null ? null : (entries.get(v) ?? null);
}
