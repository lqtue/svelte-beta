/**
 * Client-side API helpers for the VWAI workflow.
 * Uses /api/vwai/cdec — any authenticated user may access.
 */

import type { CdecRecord, CdecRecordPatch, CdecFilters } from '$lib/cdec/types';

const BASE = '/api/vwai/cdec';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export async function fetchVwaiRecords(filters: CdecFilters = {}): Promise<{ records: CdecRecord[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.search)        params.set('search', filters.search);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.province)      params.set('province', filters.province);
    if (filters.district)      params.set('district', filters.district);
    if (filters.tactical_zone) params.set('tactical_zone', filters.tactical_zone);
    if (filters.geolocated)    params.set('geolocated', '1');
    if (filters.date_from)     params.set('date_from', filters.date_from);
    if (filters.date_to)       params.set('date_to', filters.date_to);
    if (filters.assigned_to && filters.assigned_to !== 'all') params.set('assigned_to', filters.assigned_to);
    if (filters.page != null)  params.set('page', String(filters.page));
    if (filters.limit != null) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return req(`${BASE}${qs ? '?' + qs : ''}`);
}

export async function fetchVwaiRecord(id: string): Promise<CdecRecord> {
    return req(`${BASE}/${id}`);
}

export async function updateVwaiRecord(id: string, patch: CdecRecordPatch): Promise<CdecRecord> {
    return req(`${BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
}

export async function claimVwaiRecord(id: string): Promise<CdecRecord> {
    return req(`${BASE}/${id}/claim`, { method: 'POST' });
}

export async function actionVwaiRecord(
    id: string,
    action: 'submit' | 'validate' | 'flag' | 'close' | 'unclaim',
    reason?: string,
): Promise<CdecRecord> {
    return req(`${BASE}/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
    });
}

export async function fetchVwaiProfiles(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    return req(`${BASE}/profiles?ids=${ids.join(',')}`);
}
