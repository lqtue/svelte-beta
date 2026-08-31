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
 * submission and story publishing (both RLS-gated client writes), plus the
 * negative case that an anonymous caller cannot reach the staff route.
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
    .select('id, is_public')
    .single();
  expect(error, error?.message).toBeNull();
  created.storyIds.push(story!.id);
  expect(story!.is_public).toBe(false);

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const draftRead = await anon.from('stories').select('id').eq('id', story!.id).maybeSingle();
  expect(draftRead.data).toBeNull();

  const { error: pubErr } = await asUser
    .from('stories')
    .update({ is_public: true })
    .eq('id', story!.id);
  expect(pubErr, pubErr?.message).toBeNull();

  const publishedRead = await anon.from('stories').select('id').eq('id', story!.id).maybeSingle();
  expect(publishedRead.data?.id).toBe(story!.id);
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

  const { data: jobs } = await admin
    .from('pipeline_jobs')
    .select('id, kind, payload')
    .eq('map_id', mapId);
  expect(jobs).toHaveLength(1);
  expect(jobs![0].kind).toBe('ocr');
  // The worker builds its command line from this payload, so the defaults matter.
  expect((jobs![0].payload as { tile_size: number; auto: boolean }).tile_size).toBe(2400);
  expect((jobs![0].payload as { tile_size: number; auto: boolean }).auto).toBe(true);
});
