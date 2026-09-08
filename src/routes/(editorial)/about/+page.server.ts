/**
 * The numbers on /about, read from the database rather than typed into the
 * page. They were hardcoded until Sept 2026 and had drifted badly — the label
 * count was out by a factor of three and the review count by half — so the one
 * page whose job is to be honest about the state of the archive was the page
 * most out of date. Counting on render is cheaper than remembering to edit.
 *
 * Six queries, cached at the edge for an hour: nothing here changes faster.
 */

import type { PageServerLoad } from './$types';
import { adminClient } from '$lib/server/supabaseAdmin';

export const load: PageServerLoad = async ({ setHeaders }) => {
  const db = adminClient();
  const head = { count: 'exact' as const, head: true };

  const [published, drafts, labels, labelsChecked, shapes, shapesApproved] = await Promise.all([
    // Not a head count: the same 39 rows give the year range and the city split.
    db.from('maps').select('year, location').in('status', ['public', 'featured']),
    db.from('maps').select('id', head).eq('status', 'draft'),
    db.from('ocr_extractions').select('id', head),
    db.from('ocr_extractions').select('id', head).eq('status', 'validated'),
    db.from('footprint_submissions').select('id', head),
    db.from('footprint_submissions').select('id', head).eq('status', 'approved'),
  ]);

  const rows = published.data ?? [];
  const years = rows.map((r) => r.year).filter((y): y is number => typeof y === 'number');
  const cities = new Map<string, number>();
  for (const r of rows) {
    if (r.location) cities.set(r.location, (cities.get(r.location) ?? 0) + 1);
  }

  setHeaders({ 'cache-control': 'public, max-age=3600' });

  return {
    stats: {
      published: rows.length,
      drafts: drafts.count ?? 0,
      labels: labels.count ?? 0,
      labelsChecked: labelsChecked.count ?? 0,
      shapes: shapes.count ?? 0,
      shapesApproved: shapesApproved.count ?? 0,
      yearFrom: years.length ? Math.min(...years) : null,
      yearTo: years.length ? Math.max(...years) : null,
      // Biggest first — "Saigon 22, Huế 10, Hanoi 7".
      cities: [...cities.entries()].sort((a, b) => b[1] - a[1]),
    },
  };
};
