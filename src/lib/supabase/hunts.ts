import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { TreasureHunt, HuntStop, HuntProgress } from '$lib/hunt/types';

type DbHunt = Database['public']['Tables']['hunts']['Row'];
type DbHuntInsert = Database['public']['Tables']['hunts']['Insert'];
type DbStop = Database['public']['Tables']['hunt_stops']['Row'];
type DbStopInsert = Database['public']['Tables']['hunt_stops']['Insert'];
type DbProgress = Database['public']['Tables']['hunt_progress']['Row'];

function dbStopToHuntStop(row: DbStop): HuntStop {
  return {
    id: row.id,
    order: row.sort_order,
    title: row.title,
    description: row.description || '',
    hint: row.hint || undefined,
    quest: row.quest || undefined,
    coordinates: [row.lon, row.lat],
    triggerRadius: row.trigger_radius,
    interaction: row.interaction as HuntStop['interaction'],
    qrPayload: row.qr_payload || undefined,
    overlayMapId: row.overlay_map_id || undefined
  };
}

function dbHuntToTreasureHunt(hunt: DbHunt, stops: DbStop[]): TreasureHunt {
  return {
    id: hunt.id,
    title: hunt.title,
    description: hunt.description || '',
    stops: stops
      .filter((s) => s.hunt_id === hunt.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(dbStopToHuntStop),
    region: hunt.region as TreasureHunt['region'],
    createdAt: new Date(hunt.created_at).getTime(),
    updatedAt: new Date(hunt.updated_at).getTime()
  };
}

// Helper to cast Supabase query results
function asHunts(data: unknown): DbHunt[] {
  return data as DbHunt[];
}

function asStops(data: unknown): DbStop[] {
  return data as DbStop[];
}

function asProgress(data: unknown): DbProgress[] {
  return data as DbProgress[];
}

export async function fetchUserHunts(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<TreasureHunt[]> {
  const { data: hunts, error: huntsError } = await supabase
    .from('hunts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (huntsError || !hunts) {
    console.error('Failed to fetch hunts:', huntsError);
    return [];
  }

  const typedHunts = asHunts(hunts);
  if (typedHunts.length === 0) return [];

  const huntIds = typedHunts.map((h) => h.id);
  const { data: stops, error: stopsError } = await supabase
    .from('hunt_stops')
    .select('*')
    .in('hunt_id', huntIds)
    .order('sort_order');

  if (stopsError) {
    console.error('Failed to fetch stops:', stopsError);
  }

  return typedHunts.map((hunt) => dbHuntToTreasureHunt(hunt, asStops(stops || [])));
}

export async function fetchPublicHunts(
  supabase: SupabaseClient<Database>
): Promise<TreasureHunt[]> {
  const { data: hunts, error: huntsError } = await supabase
    .from('hunts')
    .select('*')
    .eq('is_public', true)
    .order('updated_at', { ascending: false });

  if (huntsError || !hunts) {
    console.error('Failed to fetch public hunts:', huntsError);
    return [];
  }

  const typedHunts = asHunts(hunts);
  if (typedHunts.length === 0) return [];

  const huntIds = typedHunts.map((h) => h.id);
  const { data: stops } = await supabase
    .from('hunt_stops')
    .select('*')
    .in('hunt_id', huntIds)
    .order('sort_order');

  return typedHunts.map((hunt) => dbHuntToTreasureHunt(hunt, asStops(stops || [])));
}

export async function createHunt(
  supabase: SupabaseClient<Database>,
  userId: string,
  hunt: { title: string; description?: string; region?: TreasureHunt['region'] }
): Promise<string | null> {
  const insertData: DbHuntInsert = {
    user_id: userId,
    title: hunt.title,
    description: hunt.description || null,
    region: hunt.region || null
  };

  const { data, error } = await supabase
    .from('hunts')
    .insert(insertData as never)
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create hunt:', error);
    return null;
  }

  return (data as unknown as { id: string }).id;
}

export async function updateHunt(
  supabase: SupabaseClient<Database>,
  huntId: string,
  updates: { title?: string; description?: string; region?: TreasureHunt['region']; is_public?: boolean }
): Promise<boolean> {
  const { error } = await supabase
    .from('hunts')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', huntId);

  if (error) {
    console.error('Failed to update hunt:', error);
    return false;
  }
  return true;
}

export async function deleteHunt(
  supabase: SupabaseClient<Database>,
  huntId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('hunts')
    .delete()
    .eq('id', huntId);

  if (error) {
    console.error('Failed to delete hunt:', error);
    return false;
  }
  return true;
}

export async function addStop(
  supabase: SupabaseClient<Database>,
  huntId: string,
  stop: { title: string; coordinates: [number, number]; sortOrder: number }
): Promise<string | null> {
  const insertData: DbStopInsert = {
    hunt_id: huntId,
    sort_order: stop.sortOrder,
    title: stop.title,
    lon: stop.coordinates[0],
    lat: stop.coordinates[1]
  };

  const { data, error } = await supabase
    .from('hunt_stops')
    .insert(insertData as never)
    .select('id')
    .single();

  if (error) {
    console.error('Failed to add stop:', error);
    return null;
  }

  // Update hunt timestamp
  await supabase.from('hunts').update({ updated_at: new Date().toISOString() } as never).eq('id', huntId);

  return (data as unknown as { id: string }).id;
}

export async function updateStop(
  supabase: SupabaseClient<Database>,
  stopId: string,
  updates: Partial<{
    title: string;
    description: string;
    hint: string;
    quest: string;
    lon: number;
    lat: number;
    sort_order: number;
    trigger_radius: number;
    interaction: string;
    qr_payload: string;
    overlay_map_id: string;
  }>
): Promise<boolean> {
  const { error } = await supabase
    .from('hunt_stops')
    .update(updates as never)
    .eq('id', stopId);

  if (error) {
    console.error('Failed to update stop:', error);
    return false;
  }
  return true;
}

export async function removeStop(
  supabase: SupabaseClient<Database>,
  stopId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('hunt_stops')
    .delete()
    .eq('id', stopId);

  if (error) {
    console.error('Failed to remove stop:', error);
    return false;
  }
  return true;
}

export async function upsertProgress(
  supabase: SupabaseClient<Database>,
  userId: string,
  huntId: string,
  progress: Partial<{
    current_stop_index: number;
    completed_stops: string[];
    completed_at: string | null;
  }>
): Promise<boolean> {
  const { error } = await supabase
    .from('hunt_progress')
    .upsert(
      {
        user_id: userId,
        hunt_id: huntId,
        ...progress
      } as never,
      { onConflict: 'user_id,hunt_id' }
    );

  if (error) {
    console.error('Failed to upsert progress:', error);
    return false;
  }
  return true;
}

export async function fetchProgress(
  supabase: SupabaseClient<Database>,
  userId: string,
  huntId: string
): Promise<HuntProgress | null> {
  const { data, error } = await supabase
    .from('hunt_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('hunt_id', huntId)
    .single();

  if (error || !data) return null;

  const row = data as unknown as DbProgress;
  return {
    huntId: row.hunt_id,
    currentStopIndex: row.current_stop_index,
    completedStops: row.completed_stops,
    startedAt: new Date(row.started_at).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : undefined
  };
}

export async function fetchAllProgress(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Record<string, HuntProgress>> {
  const { data, error } = await supabase
    .from('hunt_progress')
    .select('*')
    .eq('user_id', userId);

  if (error || !data) return {};

  const rows = asProgress(data);
  const result: Record<string, HuntProgress> = {};
  for (const row of rows) {
    result[row.hunt_id] = {
      huntId: row.hunt_id,
      currentStopIndex: row.current_stop_index,
      completedStops: row.completed_stops,
      startedAt: new Date(row.started_at).getTime(),
      completedAt: row.completed_at ? new Date(row.completed_at).getTime() : undefined
    };
  }
  return result;
}
