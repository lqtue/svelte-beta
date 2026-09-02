import {
  expect,
  test,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

/**
 * Write-path smokes (ROADMAP A5). Unlike smoke.spec.ts these DO write rows, so
 * they refuse to run against anything but a loopback Supabase and delete what
 * they create.
 *
 * Covered: the OCR-review API route (staff-gated server write), footprint
 * submission and story publishing (both RLS-gated client writes), the
 * negative case that an anonymous caller cannot reach the staff route, and
 * label search (mig 065: fuzzy hit, draft-map labels hidden from anonymous).
 *
 * ponytail: the client writes go through supabase-js on the same contract the
 * app's data layer uses, not through the drawing UI — canvas-dragging tests
 * would cost far more than the coverage they add. Add those when a UI wiring
 * bug actually escapes.
 */

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const TEST_EMAIL = 'write-smoke@vma.test';
const TEST_PASSWORD = 'write-smoke-password';
const TEST_MAP_ALLMAPS_ID = 'f0f0f0f0f0f0f0f0';
const TEST_WORKER_TOKEN = 'write-smoke-worker-token';

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(SUPABASE_URL ?? '')) {
  throw new Error(
    `write.spec.ts writes rows and must not run against ${SUPABASE_URL}. Point .env.test at a local stack (supabase start).`
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let session: Session;
let mapId: string;
let staffRequest: APIRequestContext;
/** Everything this file inserts, so afterAll can take it back out. */
const created = {
  runIds: [] as string[],
  footprintIds: [] as string[],
  storyIds: [] as string[],
  jobIds: [] as string[],
  mapIds: [] as string[],
};

test.beforeAll(async () => {
  const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(
      `Could not sign in as ${TEST_EMAIL} — run: node --env-file=.env.test scripts/seed-test-db.mjs (${error?.message})`
    );
  }
  session = data.session;

  const { data: map, error: mapErr } = await admin
    .from('maps')
    .select('id')
    .eq('allmaps_id', TEST_MAP_ALLMAPS_ID)
    .single();
  if (mapErr || !map) throw new Error('Fixture map missing — run scripts/seed-test-db.mjs');
  mapId = map.id;

  // The app authenticates server routes by cookie, so let @supabase/ssr write
  // the cookies itself (name, chunking and encoding all match that way).
  const jar: { name: string; value: string }[] = [];
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: { getAll: () => jar, setAll: (cookies) => cookies.forEach((c) => jar.push(c)) },
  });
  await ssr.auth.setSession(session);

  staffRequest = await playwrightRequest.newContext({
    baseURL: 'http://localhost:5199',
    storageState: {
      cookies: jar.map((c) => ({
        name: c.name,
        value: c.value,
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      })),
      origins: [],
    },
  });
});

test.afterAll(async () => {
  for (const runId of created.runIds)
    await admin.from('ocr_extractions').delete().eq('run_id', runId);
  for (const id of created.footprintIds)
    await admin.from('footprint_submissions').delete().eq('id', id);
  for (const id of created.storyIds) await admin.from('stories').delete().eq('id', id);
  for (const id of created.jobIds) await admin.from('pipeline_jobs').delete().eq('id', id);
  for (const id of created.mapIds) await admin.from('maps').delete().eq('id', id);
  await staffRequest?.dispose();
});

test('staff can create and validate an OCR bbox through the review API', async () => {
  const runId = `write-smoke-${Date.now()}`;
  created.runIds.push(runId);

  const post = await staffRequest.post(`/api/admin/maps/${mapId}/ocr-review`, {
    data: {
      run_id: runId,
      global_x: 100,
      global_y: 200,
      global_w: 50,
      global_h: 20,
      text: 'Rue Catinat',
      category: 'street_name',
    },
  });
  expect(post.ok(), await post.text()).toBe(true);
  const { id } = await post.json();
  expect(id).toBeTruthy();

  const patch = await staffRequest.patch(`/api/admin/maps/${mapId}/ocr-review`, {
    data: { id, status: 'validated', text: 'Rue Catinat' },
  });
  expect(patch.ok(), await patch.text()).toBe(true);

  const get = await staffRequest.get(`/api/admin/maps/${mapId}/ocr-review?run_id=${runId}`);
  expect(get.ok()).toBe(true);
  const { extractions } = await get.json();
  const row = extractions.find((e: { id: string }) => e.id === id);
  expect(row.status).toBe('validated');
  expect(row.text_validated).toBe('Rue Catinat');
  expect(row.validated_at).toBeTruthy();
});

test('an anonymous caller cannot reach the staff review API', async () => {
  const anon = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });
  const res = await anon.get(`/api/admin/maps/${mapId}/ocr-review`);
  expect(res.status()).toBe(401);
  await anon.dispose();
});

test('a signed-in user can submit a footprint and it lands as submitted', async () => {
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await asUser.auth.setSession(session);

  const { data, error } = await asUser
    .from('footprint_submissions')
    .insert({
      map_id: mapId,
      user_id: session.user.id,
      pixel_polygon: [
        [10, 10],
        [30, 10],
        [30, 30],
        [10, 30],
      ],
      name: 'write-smoke building',
      feature_type: 'building',
    })
    .select('id, status')
    .single();

  expect(error, error?.message).toBeNull();
  created.footprintIds.push(data!.id);
  expect(data!.status).toBe('submitted');

  // The map is public, so the row is readable without a session (RLS mig 038).
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: readBack } = await anon
    .from('footprint_submissions')
    .select('id')
    .eq('id', data!.id)
    .single();
  expect(readBack?.id).toBe(data!.id);
});

test('publishing a story makes it readable by anonymous visitors', async () => {
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await asUser.auth.setSession(session);

  const { data: story, error } = await asUser
    .from('stories')
    .insert({ user_id: session.user.id, title: 'Write-smoke tour', mode: 'guided' })
    .select('id, status')
    .single();
  expect(error, error?.message).toBeNull();
  created.storyIds.push(story!.id);
  expect(story!.status).toBe('draft');

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const draftRead = await anon.from('stories').select('id').eq('id', story!.id).maybeSingle();
  expect(draftRead.data).toBeNull();

  // Publishing submits for review; an author cannot approve their own story.
  const { error: subErr } = await asUser
    .from('stories')
    .update({ status: 'submitted' })
    .eq('id', story!.id);
  expect(subErr, subErr?.message).toBeNull();
  expect(
    (await anon.from('stories').select('id').eq('id', story!.id).maybeSingle()).data
  ).toBeNull();

  const selfApprove = await asUser
    .from('stories')
    .update({ status: 'approved' })
    .eq('id', story!.id);
  expect(selfApprove.error, 'an author must not be able to approve their own story').not.toBeNull();

  // A mod decides, through the API, and only then is it public.
  const review = await staffRequest.patch('/api/admin/stories', {
    data: { id: story!.id, status: 'approved' },
  });
  expect(review.ok(), await review.text()).toBe(true);

  const publishedRead = await anon.from('stories').select('id').eq('id', story!.id).maybeSingle();
  expect(publishedRead.data?.id).toBe(story!.id);

  const { data: stamped } = await admin
    .from('stories')
    .select('reviewed_by, reviewed_at')
    .eq('id', story!.id)
    .single();
  expect(stamped!.reviewed_by).toBe(session.user.id);
  expect(stamped!.reviewed_at).toBeTruthy();
});

test('running OCR enqueues one job, and only one at a time', async () => {
  const post = await staffRequest.post(`/api/admin/maps/${mapId}/ocr`, {
    data: { run_id: `write-smoke-${Date.now()}`, tile_size: 2400, overlap: 600 },
  });
  expect(post.status(), await post.text()).toBe(202);
  const { job_id, status } = await post.json();
  created.jobIds.push(job_id);
  expect(status).toBe('queued');

  // idx_pipeline_jobs_one_live: a second click must not queue a duplicate run.
  const again = await staffRequest.post(`/api/admin/maps/${mapId}/ocr`, { data: {} });
  expect(again.status()).toBe(409);

  // Filtered by kind: publishing a map queues hosting jobs too (mig 058).
  const { data: jobs } = await admin
    .from('pipeline_jobs')
    .select('id, kind, payload')
    .eq('map_id', mapId)
    .eq('kind', 'ocr');
  expect(jobs).toHaveLength(1);
  // The worker builds its command line from this payload, so the defaults matter.
  expect((jobs![0].payload as { tile_size: number; auto: boolean }).tile_size).toBe(2400);
  expect((jobs![0].payload as { tile_size: number; auto: boolean }).auto).toBe(true);

  // The one-live-job index is per (kind, map), so leaving this queued would
  // block the next test from enqueuing its own.
  await admin.from('pipeline_jobs').delete().eq('map_id', mapId).eq('kind', 'ocr');
});

test('a worker key claims a job and reports back through /api/pipeline', async () => {
  const runId = `worker-smoke-${Date.now()}`;
  created.runIds.push(runId);

  const { data: job, error: jobErr } = await admin
    .from('pipeline_jobs')
    .insert({ kind: 'ocr', map_id: mapId, payload: { run_id: runId } })
    .select('id')
    .single();
  expect(jobErr, jobErr?.message).toBeNull();
  created.jobIds.push(job!.id);

  const asWorker = await playwrightRequest.newContext({
    baseURL: 'http://localhost:5199',
    extraHTTPHeaders: { Authorization: `Bearer ${TEST_WORKER_TOKEN}` },
  });

  const claim = await asWorker.post('/api/pipeline/claim', {
    data: { kinds: ['ocr'], worker: 'write-smoke-box' },
  });
  expect(claim.ok(), await claim.text()).toBe(true);
  const claimed = (await claim.json()).job;
  expect(claimed.id).toBe(job!.id);
  expect(claimed.status).toBe('claimed');
  expect(claimed.payload.run_id).toBe(runId);

  // One round trip carries the rows, the stage and the job's own outcome.
  const results = await asWorker.post('/api/pipeline/results', {
    data: {
      job_id: job!.id,
      status: 'done',
      result: { returncode: 0 },
      extractions: [
        {
          map_id: mapId,
          run_id: runId,
          tile_x: 0,
          tile_y: 0,
          tile_w: 512,
          tile_h: 512,
          global_x: 10,
          global_y: 20,
          global_w: 30,
          global_h: 12,
          category: 'street_name',
          text: 'Boulevard Bonard',
          confidence: 0.9,
          model: 'write-smoke',
          prompt: 'write-smoke',
        },
      ],
    },
  });
  expect(results.ok(), await results.text()).toBe(true);

  const { data: finished } = await admin
    .from('pipeline_jobs')
    .select('status, result, finished_at')
    .eq('id', job!.id)
    .single();
  expect(finished!.status).toBe('done');
  expect(finished!.finished_at).toBeTruthy();

  const { data: rows } = await admin.from('ocr_extractions').select('text').eq('run_id', runId);
  expect(rows).toHaveLength(1);

  // Nothing wrote a stage: map_pipeline_status is a view (mig 056), so closing
  // the job is what advances it.
  const { data: stage } = await admin
    .from('map_pipeline_status')
    .select('stage, ocr_run_id')
    .eq('map_id', mapId)
    .single();
  expect(stage!.stage).toBe('ocr_done');
  expect(stage!.ocr_run_id).toBe(runId);

  await asWorker.dispose();
});

test('only the human stages can be set by hand', async () => {
  const derived = await staffRequest.patch(`/api/admin/maps/${mapId}/pipeline`, {
    data: { stage: 'ocr_done' },
  });
  expect(derived.status()).toBe(400);

  const marked = await staffRequest.patch(`/api/admin/maps/${mapId}/pipeline`, {
    data: { stage: 'reviewed' },
  });
  expect(marked.ok(), await marked.text()).toBe(true);
  expect((await marked.json()).reviewed_at).toBeTruthy();

  await staffRequest.patch(`/api/admin/maps/${mapId}/pipeline`, { data: { stage: 'idle' } });
  await admin.from('map_review_marks').delete().eq('map_id', mapId);
});

test('the pipeline endpoints refuse a missing or unknown worker token', async () => {
  const anon = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });
  expect((await anon.post('/api/pipeline/claim', { data: { kinds: ['ocr'] } })).status()).toBe(401);

  const wrong = await playwrightRequest.newContext({
    baseURL: 'http://localhost:5199',
    extraHTTPHeaders: { Authorization: 'Bearer not-a-real-token' },
  });
  expect((await wrong.post('/api/pipeline/results', { data: { job_id: mapId } })).status()).toBe(
    401
  );

  await anon.dispose();
  await wrong.dispose();
});

test('reviewing a footprint moves it out of the queue exactly once', async () => {
  const { data: fp, error: fpErr } = await admin
    .from('footprint_submissions')
    .insert({
      map_id: mapId,
      user_id: session.user.id,
      pixel_polygon: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      feature_type: 'building',
      status: 'needs_review',
      source: 'sam-auto',
    })
    .select('id')
    .single();
  expect(fpErr, fpErr?.message).toBeNull();
  created.footprintIds.push(fp!.id);

  const approve = await staffRequest.patch('/api/admin/footprints', {
    data: {
      id: fp!.id,
      status: 'submitted',
      pixel_polygon: [
        [0, 0],
        [12, 0],
        [12, 12],
      ],
    },
  });
  expect(approve.ok(), await approve.text()).toBe(true);

  const { data: reviewed } = await admin
    .from('footprint_submissions')
    .select('status, source')
    .eq('id', fp!.id)
    .single();
  expect(reviewed!.status).toBe('submitted');
  // An edited polygon is machine output a human fixed, and exports care.
  expect(reviewed!.source).toBe('sam-corrected');

  // set_footprint_status only moves rows out of needs_review, so a second
  // decision on the same row is refused rather than silently applied.
  const again = await staffRequest.patch('/api/admin/footprints', {
    data: { id: fp!.id, status: 'rejected' },
  });
  expect(again.status()).toBe(409);
});

test('publishing a map queues its hosting jobs, once', async () => {
  const { data: draft, error: draftErr } = await admin
    .from('maps')
    .insert({
      allmaps_id: `pub${Date.now()}`.slice(0, 16),
      name: 'Publish-smoke fixture',
      status: 'draft',
      // Both jobs are wanted here, so the fixture has to earn both: an upstream
      // annotation to mirror (georef_done) and imagery not yet on our host.
      georef_done: true,
      iiif_image: 'https://example.invalid/iiif/publish-smoke',
    })
    .select('id')
    .single();
  expect(draftErr, draftErr?.message).toBeNull();

  const { data: quiet } = await admin.from('pipeline_jobs').select('id').eq('map_id', draft!.id);
  expect(quiet).toHaveLength(0); // a draft queues nothing

  await admin.from('maps').update({ status: 'public' }).eq('id', draft!.id);

  const { data: queued } = await admin.from('pipeline_jobs').select('kind').eq('map_id', draft!.id);
  expect(queued!.map((j) => j.kind).sort()).toEqual(['mirror_annotation', 'tile_to_r2']);

  // Re-publishing must not pile up duplicates while the first pair is live.
  await admin.from('maps').update({ status: 'draft' }).eq('id', draft!.id);
  await admin.from('maps').update({ status: 'featured' }).eq('id', draft!.id);
  const { data: still } = await admin.from('pipeline_jobs').select('id').eq('map_id', draft!.id);
  expect(still).toHaveLength(2);

  await admin.from('maps').delete().eq('id', draft!.id); // cascades to the jobs
});

test('publishing queues neither job when neither would accomplish anything', async () => {
  // The shape of the 62 drafts: never georeferenced, scan already served from
  // our own host. Migration 064 stops both jobs; before it, publishing these
  // queued a doomed mirror and a redundant re-tile apiece.
  const { data: draft } = await admin
    .from('maps')
    .insert({
      allmaps_id: `noop${Date.now()}`.slice(0, 16),
      name: 'Publish-smoke no-op fixture',
      status: 'draft',
      georef_done: false,
      iiif_image: 'https://iiif.maparchive.vn/iiif/publish-smoke-noop',
    })
    .select('id')
    .single();

  await admin.from('maps').update({ status: 'public' }).eq('id', draft!.id);

  const { data: queued } = await admin.from('pipeline_jobs').select('kind').eq('map_id', draft!.id);
  expect(queued).toHaveLength(0);

  // Georeferencing it later is what earns the mirror.
  await admin.from('maps').update({ status: 'draft' }).eq('id', draft!.id);
  await admin.from('maps').update({ georef_done: true }).eq('id', draft!.id);
  await admin.from('maps').update({ status: 'public' }).eq('id', draft!.id);

  const { data: after } = await admin.from('pipeline_jobs').select('kind').eq('map_id', draft!.id);
  expect(after!.map((j) => j.kind)).toEqual(['mirror_annotation']);

  await admin.from('maps').delete().eq('id', draft!.id);
});

test('the server-side executor only takes the kinds it can run', async () => {
  const { data: job } = await admin
    .from('pipeline_jobs')
    .insert({ kind: 'ocr', map_id: mapId, payload: { run_id: `exec-${Date.now()}` } })
    .select('id')
    .single();
  created.jobIds.push(job!.id);

  const asWorker = await playwrightRequest.newContext({
    baseURL: 'http://localhost:5199',
    extraHTTPHeaders: { Authorization: `Bearer ${TEST_WORKER_TOKEN}` },
  });

  // ocr has real compute behind it: the worker runs it and reports results.
  const wrongKind = await asWorker.post('/api/pipeline/execute', { data: { job_id: job!.id } });
  expect(wrongKind.status()).toBe(400);

  const missing = await asWorker.post('/api/pipeline/execute', {
    data: { job_id: '00000000-0000-4000-8000-000000000000' },
  });
  expect(missing.status()).toBe(404);

  const anon = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });
  expect((await anon.post('/api/pipeline/execute', { data: { job_id: job!.id } })).status()).toBe(
    401
  );

  await asWorker.dispose();
  await anon.dispose();
  await admin.from('pipeline_jobs').delete().eq('id', job!.id);
});

test('the share page is server-rendered and hides drafts', async () => {
  const anon = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });

  // No JavaScript runs here: this is what a link-preview crawler sees.
  const res = await anon.get(`/map/${mapId}`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('og:title');
  expect(html).toContain('Write-smoke fixture map');
  expect(html).toContain(`/explore?map=${mapId}`);

  const { data: draft } = await admin
    .from('maps')
    .insert({
      allmaps_id: `shr${Date.now()}`.slice(0, 16),
      name: 'Share-smoke draft',
      status: 'draft',
    })
    .select('id')
    .single();

  // A draft is not published, so its link must not resolve for anyone.
  expect((await anon.get(`/map/${draft!.id}`)).status()).toBe(404);

  await admin.from('maps').delete().eq('id', draft!.id);
  await anon.dispose();
});

test('tracing submits through the API, which stamps the author', async () => {
  const res = await staffRequest.post('/api/contribute/footprints', {
    data: {
      map_id: mapId,
      pixel_polygon: [
        [1, 1],
        [5, 1],
        [5, 5],
      ],
      name: 'api-traced building',
      // A body that tried to attribute the trace to someone else must not win.
      user_id: '00000000-0000-4000-8000-000000000000',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = await res.json();
  created.footprintIds.push(id);

  const { data: row } = await admin
    .from('footprint_submissions')
    .select('user_id, source, status')
    .eq('id', id)
    .single();
  expect(row!.user_id).toBe(session.user.id);
  // 'volunteer' is the schema's word for hand-traced; 'manual' was never valid.
  expect(row!.source).toBe('volunteer');
  expect(row!.status).toBe('submitted');

  const anon = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });
  const rejected = await anon.post('/api/contribute/footprints', {
    data: {
      map_id: mapId,
      pixel_polygon: [
        [0, 0],
        [1, 1],
      ],
    },
  });
  expect(rejected.status()).toBe(401);
  await anon.dispose();
});

test('a published map must be georeferenceable', async () => {
  // Neither annotation_url nor allmaps_id: nothing to warp with, so publishing
  // is refused (mig 062) rather than shipping a map that cannot render.
  const { data: draft } = await admin
    .from('maps')
    .insert({ name: 'Ungeoreferenced fixture', status: 'draft' })
    .select('id')
    .single();

  const { error: pubErr } = await admin
    .from('maps')
    .update({ status: 'public' })
    .eq('id', draft!.id);
  expect(pubErr?.message ?? '').toContain('maps_public_needs_georef');

  // With an Allmaps id it is publishable, even before the annotation is mirrored.
  await admin
    .from('maps')
    .update({ allmaps_id: `geo${Date.now()}`.slice(0, 16) })
    .eq('id', draft!.id);
  const { error: okErr } = await admin
    .from('maps')
    .update({ status: 'public' })
    .eq('id', draft!.id);
  expect(okErr, okErr?.message).toBeNull();

  await admin.from('maps').delete().eq('id', draft!.id);
});

test('a draft map is invisible to an anonymous reader, visible once signed in', async () => {
  const { data: draft } = await admin
    .from('maps')
    .insert({
      allmaps_id: `rls${Date.now()}`.slice(0, 16),
      name: 'RLS-smoke draft',
      status: 'draft',
    })
    .select('id')
    .single();

  // The publishable key ships in every client bundle, so "anonymous" here is
  // "anyone on the internet". Before migration 063 this returned the row.
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: unauthed } = await anon.from('maps').select('id').eq('id', draft!.id);
  expect(unauthed).toEqual([]);

  // A signed-in volunteer still needs drafts: /contribute/georef selects them
  // by status, and the digitalize and trace pickers are mostly unpublished maps.
  const signedIn = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await signedIn.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  const { data: authed } = await signedIn.from('maps').select('id').eq('id', draft!.id);
  expect(authed).toHaveLength(1);

  // Published maps stay readable without an account.
  const { data: published } = await anon.from('maps').select('id').eq('id', mapId);
  expect(published).toHaveLength(1);

  await admin.from('maps').delete().eq('id', draft!.id);
});

test("label search finds a typo'd label on a public map and hides draft-map labels from anonymous", async () => {
  const runId = `write-smoke-labels-${Date.now()}`;
  created.runIds.push(runId);

  const { data: draft, error: draftErr } = await admin
    .from('maps')
    .insert({ name: 'Write-smoke draft map', status: 'draft', year: 1901 })
    .select('id')
    .single();
  expect(draftErr, draftErr?.message).toBeNull();
  created.mapIds.push(draft!.id);

  const row = (map_id: string, text: string, tile_y: number) => ({
    map_id,
    run_id: runId,
    tile_x: 0,
    tile_y,
    tile_w: 100,
    tile_h: 100,
    global_x: 10,
    global_y: 20,
    global_w: 50,
    global_h: 10,
    text,
    category: 'street',
    confidence: 0.9,
  });
  const { error: insErr } = await admin
    .from('ocr_extractions')
    .insert([row(mapId, 'Rue de Khánh-Hội', 0), row(draft!.id, 'Khanh Hoi (draft)', 1)]);
  expect(insErr, insErr?.message).toBeNull();

  // Anonymous: one-letter typo still hits, the draft map's label does not appear.
  const anon = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });
  const res = await anon.get('/api/search?q=khan%20hoy&include=labels');
  expect(res.ok(), await res.text()).toBe(true);
  const { labels } = await res.json();
  const texts = labels.map((l: { text: string }) => l.text);
  expect(texts).toContain('Rue de Khánh-Hội');
  expect(texts).not.toContain('Khanh Hoi (draft)');
  const hit = labels.find((l: { text: string }) => l.text === 'Rue de Khánh-Hội');
  expect(hit.map_id).toBe(mapId);
  expect(hit.bbox).toEqual([10, 20, 50, 10]);
  await anon.dispose();

  // Staff see the draft map's label too.
  const staff = await staffRequest.get('/api/search?q=khanh%20hoi&include=labels');
  expect(staff.ok()).toBe(true);
  const staffTexts = (await staff.json()).labels.map((l: { text: string }) => l.text);
  expect(staffTexts).toContain('Khanh Hoi (draft)');

  // And the raw table no longer leaks draft labels to the publishable key (mig 065 RLS).
  const anonDb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: leaked } = await anonDb
    .from('ocr_extractions')
    .select('id')
    .eq('run_id', runId)
    .eq('map_id', draft!.id);
  expect(leaked).toEqual([]);
});

test('the footprint export defaults to approved, filters by year and by ground bbox', async () => {
  // Two polygons on the fixture map: one approved, one still in the queue.
  const ring = (dx: number) => [
    [10 + dx, 10],
    [30 + dx, 10],
    [30 + dx, 30],
    [10 + dx, 30],
  ];
  const { data: made, error: mkErr } = await admin
    .from('footprint_submissions')
    .insert([
      {
        map_id: mapId,
        pixel_polygon: ring(0),
        name: 'export-smoke approved',
        feature_type: 'building',
        status: 'approved',
        source: 'volunteer',
      },
      {
        map_id: mapId,
        pixel_polygon: ring(100),
        name: 'export-smoke submitted',
        feature_type: 'building',
        status: 'submitted',
        source: 'volunteer',
      },
    ])
    .select('id, status');
  expect(mkErr, mkErr?.message).toBeNull();
  for (const r of made!) created.footprintIds.push(r.id);

  const anon = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });

  // Assertions are scoped to this test's own rows by name: other tests in this
  // file leave approved footprints on the same fixture map until afterAll, so a
  // bare row count here would depend on execution order.
  const namesOf = async (qs: string): Promise<string[]> => {
    const res = await anon.get(`/api/export/footprints?${qs}`);
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()).features
      .map((f: { properties: { name: string | null } }) => f.properties.name)
      .filter((n: string | null) => n?.startsWith('export-smoke'));
  };

  // Default status: the reviewed polygon only.
  expect(await namesOf(`map_id=${mapId}`)).toEqual(['export-smoke approved']);

  // The map's year rides along, and filters.
  const def = await anon.get(`/api/export/footprints?map_id=${mapId}`);
  const props = (await def.json()).features.find(
    (f: { properties: { name: string } }) => f.properties.name === 'export-smoke approved'
  ).properties;
  expect(props.year).toBe(1900);
  expect(await namesOf(`map_id=${mapId}&year=1500-1600`)).toEqual([]);
  expect(await namesOf(`map_id=${mapId}&year=1890-1910`)).toEqual(['export-smoke approved']);

  // bbox selects on the ground. The fixture map has no resolvable annotation,
  // so nothing can be warped and a ground query must return nothing rather
  // than falling back to pixel coordinates that look like coordinates.
  expect(props.geo_converted).toBe(false);
  expect(await namesOf(`map_id=${mapId}&bbox=106.6,10.7,106.8,10.9`)).toEqual([]);

  // Malformed filters are ignored, not fatal.
  expect(await namesOf(`map_id=${mapId}&year=nope&bbox=1,2`)).toEqual(['export-smoke approved']);

  // A comma list is accepted; a malformed id is a 400, not a 500.
  expect(await namesOf(`map_id=${mapId},${mapId}`)).toEqual(['export-smoke approved']);
  const bad = await anon.get('/api/export/footprints?map_id=not-a-uuid');
  expect(bad.status()).toBe(400);

  await anon.dispose();
});

test('the place-time index warps on write, gates drafts, and rewarps on demand', async () => {
  const runId = `write-smoke-ctx-${Date.now()}`;
  created.runIds.push(runId);

  // The fixture map has no resolvable annotation, so a writer cannot warp: the
  // honest result is a null geom, not a guessed one.
  const post = await staffRequest.post(`/api/admin/maps/${mapId}/ocr-review`, {
    data: {
      run_id: runId,
      global_x: 100,
      global_y: 200,
      global_w: 50,
      global_h: 20,
      text: 'Quai de Belgique',
      category: 'street',
    },
  });
  expect(post.ok(), await post.text()).toBe(true);
  const { id: unwarpedId } = await post.json();
  const { data: unwarped } = await admin
    .from('ocr_extractions')
    .select('geom, geom_src')
    .eq('id', unwarpedId)
    .single();
  expect(unwarped!.geom).toBeNull();
  expect(unwarped!.geom_src).toBeNull();

  // Stand in for a successful warp by writing the geometry the way the warp
  // job would, then ask the index what is there.
  const HERE = { lng: 106.70098, lat: 10.77653 };
  await admin
    .from('ocr_extractions')
    .update({
      geom: `SRID=4326;POINT(${HERE.lng} ${HERE.lat})`,
      geom_src: 'smoke-src',
      geom_rmse: 4.2,
    })
    .eq('id', unwarpedId);

  const anon = await playwrightRequest.newContext({ baseURL: 'http://localhost:5199' });
  const res = await anon.get(`/api/context?lng=${HERE.lng}&lat=${HERE.lat}&radius=200`);
  expect(res.ok(), await res.text()).toBe(true);
  const ctx = await res.json();
  const hit = ctx.labels.find((l: { id: string }) => l.id === unwarpedId);
  expect(hit, 'the warped label should be in range').toBeTruthy();
  expect(hit.text).toBe('Quai de Belgique');
  expect(hit.geom_rmse).toBe(4.2);
  expect(hit.distance_m).toBeLessThan(1);
  expect(hit.year).toBe(1900);

  // A tight radius excludes it; bad coordinates are a 400, not a 500.
  const far = await anon.get(`/api/context?lng=${HERE.lng + 0.5}&lat=${HERE.lat}&radius=100`);
  expect((await far.json()).labels).toEqual([]);
  expect((await anon.get('/api/context?lng=999&lat=0')).status()).toBe(400);

  // A draft map's warped label is invisible to an anonymous caller.
  const { data: draft } = await admin
    .from('maps')
    .insert({ name: 'ctx-smoke draft map', status: 'draft', year: 1901 })
    .select('id')
    .single();
  created.mapIds.push(draft!.id);
  await admin.from('ocr_extractions').insert({
    map_id: draft!.id,
    run_id: runId,
    tile_x: 0,
    tile_y: 9,
    tile_w: 100,
    tile_h: 100,
    global_x: 10,
    global_y: 20,
    global_w: 50,
    global_h: 10,
    text: 'draft-only street',
    category: 'street',
    confidence: 0.9,
    geom: `SRID=4326;POINT(${HERE.lng} ${HERE.lat})`,
    geom_src: 'smoke-src',
  });
  const gated = await anon.get(`/api/context?lng=${HERE.lng}&lat=${HERE.lat}&radius=200`);
  const gatedTexts = (await gated.json()).labels.map((l: { text: string }) => l.text);
  expect(gatedTexts).toContain('Quai de Belgique');
  expect(gatedTexts).not.toContain('draft-only street');

  // Staff see both.
  const staffCtx = await staffRequest.get(
    `/api/context?lng=${HERE.lng}&lat=${HERE.lat}&radius=200`
  );
  const staffTexts = (await staffCtx.json()).labels.map((l: { text: string }) => l.text);
  expect(staffTexts).toContain('draft-only street');
  await anon.dispose();

  // map_context reports coverage and counts a row warped against another
  // georeference as stale — the defect the warp job clears.
  const { data: summary } = await admin.rpc('map_context', {
    p_map_id: mapId,
    p_geom_src: 'a-different-georeference',
  });
  const s = summary as unknown as {
    labels: { total: number; warped: number; stale: number };
  };
  expect(s.labels.warped).toBeGreaterThan(0);
  expect(s.labels.stale).toBeGreaterThan(0);

  // A warp job is claimable and runs server-side; this map has no annotation,
  // so it reports that rather than inventing geometry.
  const { data: job } = await admin
    .from('pipeline_jobs')
    .insert({ kind: 'warp', map_id: mapId, payload: {} })
    .select('id')
    .single();
  created.jobIds.push(job!.id);
  const asWorker = await playwrightRequest.newContext({
    baseURL: 'http://localhost:5199',
    extraHTTPHeaders: { Authorization: `Bearer ${TEST_WORKER_TOKEN}` },
  });
  const claimed = await asWorker.post('/api/pipeline/claim', {
    data: { kinds: ['warp'], worker: 'write-smoke' },
  });
  expect(claimed.ok(), await claimed.text()).toBe(true);
  const ran = await asWorker.post('/api/pipeline/execute', {
    data: { job_id: job!.id },
  });
  expect(ran.ok(), await ran.text()).toBe(true);
  expect((await ran.json()).result.reason).toBe('no usable annotation');
  await asWorker.dispose();
});
