import type { Database } from '$lib/supabase/types';

export type MapRow = Database['public']['Tables']['maps']['Row'];

export async function fetchAdminMaps(): Promise<MapRow[]> {
    const res = await fetch('/api/admin/maps');
    if (!res.ok) throw new Error('Failed to fetch maps');
    return res.json();
}

export async function createMap(data: {
    name: string;
    allmaps_id?: string;
    location?: string;
    year?: number | null;
    dc_description?: string;
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
    location: string;
    year: number | null;
    dc_description: string;
    is_featured: boolean;
    thumbnail: string;
    map_type: string;
    // provenance / source fields
    source_type: string;
    collection: string;
    source_url: string;
    original_title: string;
    shelfmark: string;
    creator: string;
    year_label: string;
    language: string;
    rights: string;
    physical_description: string;
    extra_metadata: Record<string, string>;
    // contribution control
    label_config: { legend: any[]; categories: string[] } | null;
    priority: number;
    is_public: boolean;
    georef_done: boolean;
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

// ---- IIIF Sources ----

export interface IIIFSourceRow {
    id: string;
    map_id: string;
    label?: string;
    source_type?: string;
    iiif_manifest?: string;
    iiif_image: string;
    is_primary: boolean;
    sort_order: number;
    created_at: string;
}

export async function fetchIIIFSources(mapId: string): Promise<IIIFSourceRow[]> {
    const res = await fetch(`/api/admin/maps/${mapId}/iiif-sources`);
    if (!res.ok) throw new Error('Failed to fetch IIIF sources');
    return res.json();
}

export async function addIIIFSource(mapId: string, data: {
    label?: string;
    source_type?: string;
    iiif_manifest?: string;
    iiif_image: string;
    is_primary?: boolean;
}): Promise<void> {
    const res = await fetch(`/api/admin/maps/${mapId}/iiif-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to add IIIF source' }));
        throw new Error(err.message || 'Failed to add IIIF source');
    }
}

export async function setPrimaryIIIFSource(mapId: string, sourceId: string): Promise<void> {
    const res = await fetch(`/api/admin/maps/${mapId}/iiif-sources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true })
    });
    if (!res.ok) throw new Error('Failed to set primary source');
}

export async function deleteIIIFSource(mapId: string, sourceId: string): Promise<void> {
    const res = await fetch(`/api/admin/maps/${mapId}/iiif-sources/${sourceId}`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to delete IIIF source' }));
        throw new Error(err.message || 'Failed to delete IIIF source');
    }
}

export async function fetchIIIFMetadata(manifestUrl: string): Promise<{
    title?: string;
    creator?: string;
    date?: string;
    rights?: string;
    imageServiceUrl?: string;
}> {
    const res = await fetch('/api/admin/maps/fetch-iiif-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifestUrl })
    });
    if (!res.ok) throw new Error('Failed to fetch IIIF metadata');
    return res.json();
}
