/**
 * Facet tallying shared by `/api/admin/scout` and `/api/search`.
 */

/**
 * Count rows by the value of `key`.
 *
 * By default blank values (null / undefined / '') are skipped, which is what
 * `/api/search` expects. Pass `emptyLabel` to bucket them instead — the scout
 * listing groups them under '(none)'.
 */
export function tally(
  rows: Record<string, unknown>[] | null,
  key: string,
  opts: { emptyLabel?: string } = {}
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows || []) {
    const v = row?.[key];
    let s: string;
    if (v === null || v === undefined || v === '') {
      if (opts.emptyLabel === undefined) continue;
      s = opts.emptyLabel;
    } else {
      s = String(v);
    }
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}
