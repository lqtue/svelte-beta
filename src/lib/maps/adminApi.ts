// ---- Maps module — admin API client ----
// Called from admin UI components. All requests go through server-side
// API routes that enforce admin-only access.

import type { MapRecord, MapEditPayload, MapIngestExternal } from './types';

// ---- map CRUD ----

export async function adminFetchMaps(): Promise<MapRecord[]> {
  const res = await fetch('/api/admin/maps');
  if (!res.ok) throw new Error(`Failed to fetch maps: ${res.status}`);
  return res.json();
}

export async function adminCreateMap(payload: {
  name: string;
  allmaps_id?: string;
  source_type?: string;
  map_type?: string;
  year?: number;
  summary?: string;
}): Promise<MapRecord> {
  const res = await fetch('/api/admin/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminUpdateMap(id: string, payload: MapEditPayload): Promise<MapRecord> {
  const res = await fetch(`/api/admin/maps/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminDeleteMap(id: string): Promise<void> {
  const res = await fetch(`/api/admin/maps/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

// ---- own-scan upload ----

/** Upload an image file to Internet Archive and return the IIIF base URL. */
export async function adminUploadMapImage(mapId: string, file: File): Promise<{ iiifUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`/api/admin/maps/${mapId}/image`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---- external IIIF import ----

/** Fetch metadata from a IIIF manifest URL (server-side proxy). */
export async function adminFetchIIIFMeta(manifestUrl: string): Promise<{
  title?: string;
  creator?: string;
  date?: string;
  language?: string;
  rights?: string;
  thumbnail?: string;
  imageServiceUrl?: string;
  manifestVersion: 2 | 3;
}> {
  const res = await fetch('/api/admin/maps/fetch-iiif-metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manifestUrl }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Create a map record from an external IIIF source. */
export async function adminImportExternalMap(payload: MapIngestExternal): Promise<MapRecord> {
  const res = await fetch('/api/admin/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---- IIIF sources ----

export async function adminFetchIIIFSources(mapId: string): Promise<import('./types').MapIIIFSource[]> {
  const res = await fetch(`/api/admin/maps/${mapId}/iiif-sources`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminAddIIIFSource(mapId: string, payload: import('./types').MapIIIFSourcePayload): Promise<import('./types').MapIIIFSource> {
  const res = await fetch(`/api/admin/maps/${mapId}/iiif-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminSetPrimaryIIIFSource(mapId: string, sourceId: string): Promise<void> {
  const res = await fetch(`/api/admin/maps/${mapId}/iiif-sources/${sourceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_primary: true }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function adminDeleteIIIFSource(mapId: string, sourceId: string): Promise<void> {
  const res = await fetch(`/api/admin/maps/${mapId}/iiif-sources/${sourceId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

// ---- georef ----

/** Update the Allmaps annotation for a map (after placing GCPs). */
export async function adminUpdateAnnotation(mapId: string, annotationJson: object): Promise<void> {
  const res = await fetch(`/api/admin/maps/${mapId}/annotation`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(annotationJson),
  });
  if (!res.ok) throw new Error(await res.text());
}
