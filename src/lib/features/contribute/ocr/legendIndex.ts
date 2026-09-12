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
  /**
   * Which printed block of the legend this line came from, or null on a sheet
   * that prints only one. Written by `_write_legend_rows` in `ocr.py` as
   * `block=0` in the notes, and only when the sheet has more than one block.
   */
  block: number | null;
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
    const b = Number(/\bblock=(\d+)/.exec(row.notes ?? '')?.[1]);
    // First writer wins: a re-read of the same block should not silently
    // replace an entry a person has already corrected. What that costs on a
    // sheet printing two independent tables is `ambiguousNumbers` below.
    if (!out.has(n)) out.set(n, { n, name, grid, block: Number.isFinite(b) ? b : null });
  }
  return out;
}

/** A legend name flattened enough that two readings of one line match. */
function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The numbers two printed blocks claim under different names.
 *
 * A sheet may print its legend in more than one block — the 1942 Saigon–Cholon
 * sheet prints two — and the numbers are the only evidence of what that means.
 * Either the blocks continue one sequence (1..99, then 100..236), and joining a
 * map numeral by its number is exactly right; or they are independent tables
 * both numbering from 1, and the join silently hands one table's name to the
 * other table's numerals wherever they overlap. `legendEntries` keeps the first
 * writer, so nothing downstream can see that happen.
 *
 * The test is the **name**, not the number: the same line read twice — two
 * passes, or overlapping blocks — agrees with itself and is no collision.
 * `legend_block_collisions` in `work/ocr/scripts/ocr.py` is the same check at
 * write time, over the model's output rather than the stored rows.
 */
export function ambiguousNumbers(rows: OcrExtraction[]): Set<number> {
  const byN = new Map<number, Map<number, string>>();
  for (const row of rows) {
    if (categoryOf(row) !== 'legend_entry') continue;
    const n = Number(/\bn=(\d+)/.exec(row.notes ?? '')?.[1]);
    const b = Number(/\bblock=(\d+)/.exec(row.notes ?? '')?.[1]);
    if (!Number.isFinite(n) || !Number.isFinite(b)) continue;
    const name = textOf(row)
      .replace(/^\s*\(?\d{1,3}\)?[.\s-]*/, '')
      .trim();
    if (!byN.has(n)) byN.set(n, new Map());
    // One block reads one line once; a repeat within a block is a re-run, and
    // the first of those wins here for the same reason it does above.
    const blocks = byN.get(n)!;
    if (!blocks.has(b)) blocks.set(b, name);
  }
  const out = new Set<number>();
  for (const [n, blocks] of byN) {
    if (blocks.size < 2) continue;
    if (new Set([...blocks.values()].map(foldName)).size > 1) out.add(n);
  }
  return out;
}

/**
 * The printed-table facts a row carries, or null when it carries none.
 *
 * Both kinds of printed block put their position in `notes`, because
 * `ocr_extractions` has no column for a grid cell: the legend writes
 * `n=37; grid=B10` and the street index `street index; grid=K6→K8; cells=2`.
 * So a row out of either block can be shown as the line of a table it is —
 * name, cell, number — instead of as text with a confidence beside it.
 */
export type PrintedLine = { n: number | null; grid: string };

export function printedLine(row: OcrExtraction): PrintedLine | null {
  const grid = (/\bgrid=([^;]*)/.exec(row.notes ?? '')?.[1] ?? '').trim();
  if (!grid) return null;
  const n = Number(/\bn=(\d+)/.exec(row.notes ?? '')?.[1]);
  return { n: Number.isFinite(n) ? n : null, grid };
}

/** What is wrong with a numeral, in the order a reviewer would want to see it. */
export type SuspectReason =
  /** The text is not a bare number, so it is not a legend reference at all. */
  | 'malformed'
  /** No printed entry carries this number — the sheet's own index says it cannot exist. */
  | 'no-entry'
  /** Another numeral on the sheet claims the same number. */
  | 'duplicate'
  /**
   * Two printed legend blocks give this number two different names, so the
   * name beside this numeral is a coin toss. See `ambiguousNumbers`.
   */
  | 'ambiguous-entry';

/**
 * Flag the numerals worth looking at first, keyed by row id.
 *
 * Four checks, all from the sheet's own printed index and none of them tuned:
 * a reference that is not a number, a number the index does not list, a number
 * claimed twice, and a number two printed blocks name differently. On the 1942
 * Saigon–Cholon sheet the first three are ~30 rows out of 176, which is where a
 * reviewer should start rather than at the top.
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
  const ambiguous = ambiguousNumbers(rows);
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
      // Not per run: this is two printed tables disagreeing, which is a
      // property of the sheet and true of every numeral of that value.
      if (ambiguous.has(v)) reasons.push('ambiguous-entry');
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

/**
 * What the printed index says about itself: the run it spans, the numbers it is
 * missing, the numbers it prints twice.
 *
 * The sheet numbers its legend 1..N with no gaps — that is what a printed index
 * is — so any hole is a line the pass failed to read and any repeat is a line it
 * read twice. On the 1942 Saigon–Cho Lon sheet the answer is `1..236, 22
 * missing, none repeated`, which is the whole quality report for a block of 235
 * rows and is invisible one row at a time.
 */
export type IndexGaps = { min: number; max: number; missing: number[]; repeated: number[] };

export function indexGaps(rows: OcrExtraction[]): IndexGaps | null {
  const ns: number[] = [];
  for (const row of rows) {
    if (categoryOf(row) !== 'legend_entry') continue;
    const n = Number(/\bn=(\d+)/.exec(row.notes ?? '')?.[1]);
    if (Number.isFinite(n)) ns.push(n);
  }
  if (!ns.length) return null;
  const seen = new Map<number, number>();
  for (const n of ns) seen.set(n, (seen.get(n) ?? 0) + 1);
  const min = Math.min(...ns);
  const max = Math.max(...ns);
  const missing: number[] = [];
  for (let n = min; n <= max; n++) if (!seen.has(n)) missing.push(n);
  const repeated = [...seen.entries()].filter(([, k]) => k > 1).map(([n]) => n);
  return { min, max, missing, repeated: repeated.sort((a, b) => a - b) };
}
