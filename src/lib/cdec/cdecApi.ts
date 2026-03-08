/**
 * Client-side API helpers for CDEC records.
 * Mirrors the pattern used in src/lib/admin/adminApi.ts.
 */

import type { CdecRecord, CdecRecordPatch, CdecStats, CdecFilters } from './types';

const BASE = '/api/admin/cdec';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export async function fetchCdecRecords(filters: CdecFilters = {}): Promise<{ records: CdecRecord[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.search)      params.set('search', filters.search);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.province)    params.set('province', filters.province);
    if (filters.assigned_to && filters.assigned_to !== 'all') params.set('assigned_to', filters.assigned_to);
    if (filters.page != null) params.set('page', String(filters.page));
    if (filters.limit != null) params.set('limit', String(filters.limit));

    const qs = params.toString();
    return req(`${BASE}${qs ? '?' + qs : ''}`);
}

export async function fetchCdecRecord(id: string): Promise<CdecRecord> {
    return req(`${BASE}/${id}`);
}

export async function updateCdecRecord(id: string, patch: CdecRecordPatch): Promise<CdecRecord> {
    return req(`${BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
}

export async function fetchCdecStats(): Promise<CdecStats> {
    return req(`${BASE}/stats`);
}

export async function validateCdecRecord(
    id: string,
    action: 'approve' | 'flag',
    slot: 1 | 2,
    reason?: string,
): Promise<CdecRecord> {
    return req(`${BASE}/${id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, slot, reason }),
    });
}

export async function importCdecRecords(records: Partial<CdecRecord>[]): Promise<{ upserted: number }> {
    return req(`${BASE}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
    });
}

export async function uploadCdecPhoto(id: string, dataUrl: string): Promise<{ url: string }> {
    return req(`${BASE}/${id}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
    });
}

/**
 * Construct a direct PDF viewer URL from a CDEC document number.
 * e.g. F034601092455 → https://cdec.vietnam.ttu.edu/search/images_cdec.php?img=/images/F0346/0109-2455-000.pdf
 */
export function cdecPdfUrl(cdecNumber: string): string | null {
    const n = cdecNumber.trim().toUpperCase();
    if (n.length < 13) return null;
    const series   = n.slice(0, 5);   // F0346
    const p1       = n.slice(5, 7);   // 01
    const p2       = n.slice(7, 9);   // 09
    const p3       = n.slice(9, 13);  // 2455
    const file     = `${p1}${p2}-${p3}-000.pdf`;
    return `https://cdec.vietnam.ttu.edu/search/images_cdec.php?img=/images/${series}/${file}`;
}

export async function fetchCdecProfiles(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    return req(`${BASE}/profiles?ids=${ids.join(',')}`);
}
