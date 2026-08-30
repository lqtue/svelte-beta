// /api/admin/scout — list candidates (paginated, filtered) + bulk ingest
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/auth';
import { adminClient } from '$lib/server/supabaseAdmin';
import { dbError } from '$lib/server/http';
import { tally } from '$lib/server/facets';

export const GET: RequestHandler = async ({ locals, url }) => {
  await requireRole(locals, ['admin', 'mod']);
  const supabase = adminClient();

  const status = url.searchParams.get('status') || 'pending';
  const source = url.searchParams.get('source');
  const category = url.searchParams.get('category');
  const minScore = parseInt(url.searchParams.get('minScore') || '0');
  const search = url.searchParams.get('q')?.trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '60'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const orderBy = url.searchParams.get('order') || 'score';
  const orderDir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  let q = supabase.from('scout_candidates').select('*', { count: 'exact' });
  if (status !== 'all') q = q.eq('status', status);
  if (source) q = q.eq('source', source);
  if (category) q = q.eq('category', category);
  if (minScore) q = q.gte('score', minScore);
  if (search) q = q.ilike('title', `%${search}%`);
  q = q.order(orderBy, { ascending: orderDir === 'asc' }).range(offset, offset + limit - 1);

  const { data, error: err, count } = await q;
  if (err) dbError(err, 'Could not list scout candidates');

  // Facet counts (lightweight — only when offset=0)
  let facets: Record<string, Record<string, number>> | undefined;
  if (offset === 0) {
    const facetBase = supabase.from('scout_candidates');
    const [bySource, byCategory, byStatus] = await Promise.all([
      facetBase.select('source').eq('status', status),
      facetBase.select('category').eq('status', status),
      facetBase.select('status'),
    ]);
    const opts = { emptyLabel: '(none)' };
    facets = {
      source: tally(bySource.data, 'source', opts),
      category: tally(byCategory.data, 'category', opts),
      status: tally(byStatus.data, 'status', opts),
    };
  }

  return json({ rows: data, total: count, limit, offset, facets });
};

// POST: bulk ingest approved candidates → maps rows
export const POST: RequestHandler = async ({ locals, request }) => {
  const { user } = await requireRole(locals, ['admin', 'mod']);
  const supabase = adminClient();
  const body = await request.json();
  const ids: string[] = body.ids || [];
  if (!ids.length) throw error(400, 'ids[] required');

  const { data: cands, error: fetchErr } = await supabase
    .from('scout_candidates')
    .select('*')
    .in('id', ids)
    .eq('status', 'approved');
  if (fetchErr) dbError(fetchErr, 'Could not load scout candidates');

  const results: { id: string; map_id?: string; error?: string }[] = [];
  for (const c of cands ?? []) {
    try {
      const holdingInst = c.holding_institution ?? '';
      const insertPayload = {
        name: (c.title || '(untitled)').slice(0, 240),
        year: c.year ?? null,
        year_label: c.date ?? null,
        status: 'draft',
        source_type: holdingInst.includes('David Rumsey')
          ? 'rumsey'
          : holdingInst.includes('Bibliothèque nationale')
            ? 'bnf'
            : 'other',
        holding_institution: c.holding_institution ?? null,
        collection: c.collection ?? null,
        original_title: c.title ?? null,
        creator: c.creator ?? null,
        dc_publisher: c.publisher ?? null,
        language: c.language ?? null,
        rights: c.rights ?? null,
        iiif_manifest: c.manifest_url ?? null,
        source_url: c.source_url ?? null,
        thumbnail: c.thumbnail ?? null,
        extra_metadata: {
          scout_source: c.source,
          scout_external_id: c.external_id,
          scout_category: c.category,
          scout_found_via: c.found_via,
          scout_candidate_id: c.id,
        },
      };
      const { data: newMap, error: insErr } = await supabase
        .from('maps')
        .insert(insertPayload)
        .select('id')
        .single();
      if (insErr) throw new Error(insErr.message);
      const mapId = newMap.id;

      await supabase
        .from('scout_candidates')
        .update({
          status: 'ingested',
          map_id: mapId,
          reviewer_id: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', c.id);

      results.push({ id: c.id, map_id: mapId });
    } catch (e) {
      results.push({ id: c.id, error: (e as Error).message.slice(0, 200) });
    }
  }

  return json({
    results,
    ok: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
  });
};
