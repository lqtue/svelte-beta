import type { Database } from '$lib/supabase/types';

export type MapRow = Database['public']['Tables']['maps']['Row'];

export async function fetchAdminMaps(): Promise<MapRow[]> {
    const res = await fetch('/api/admin/maps');
    if (!res.ok) throw new Error('Failed to fetch maps');
    return res.json();
}

export async function createMap(data: {
    name: string;
    allmaps_id: string;
    type?: string;
    year?: number | null;
    summary?: string;
    description?: string;
    is_featured?: boolean;
}): Promise<MapRow> {
    const res = await fetch('/api/admin/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to create map' }));
        throw new Error(err.message || 'Failed to create map');
    }
    return res.json();
}

export async function updateMap(id: string, data: Partial<{
    name: string;
    allmaps_id: string;
    type: string;
    year: number | null;
    summary: string;
    description: string;
    is_featured: boolean;
    thumbnail: string;
}>): Promise<MapRow> {
    const res = await fetch(`/api/admin/maps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to update map' }));
        throw new Error(err.message || 'Failed to update map');
    }
    return res.json();
}

export async function deleteMap(id: string): Promise<void> {
    const res = await fetch(`/api/admin/maps/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to delete map' }));
        throw new Error(err.message || 'Failed to delete map');
    }
}

export async function uploadMapImage(id: string, file: File): Promise<{
    success: boolean;
    ia_identifier: string;
    ia_filename: string;
    iiif_url: string;
}> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(`/api/admin/maps/${id}/image`, {
        method: 'POST',
        body: formData
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to upload image' }));
        throw new Error(err.message || 'Failed to upload image');
    }
    return res.json();
}

export async function uploadImageToIA(file: File, name: string): Promise<{
    iiif_url: string;
    ia_identifier: string;
    ia_filename: string;
}> {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('name', name);

    const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        body: formData
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to upload image' }));
        throw new Error(err.message || 'Failed to upload image');
    }
    return res.json();
}

export async function adminCreateGeorefSubmission(data: {
    iiif_url: string;
    name: string;
    description?: string;
}): Promise<{ id: string; iiif_url: string; name: string; status: string }> {
    const res = await fetch('/api/admin/georef', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to create georef submission' }));
        throw new Error(err.message || 'Failed to create georef submission');
    }
    return res.json();
}
