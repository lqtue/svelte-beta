import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { AnnotationSet } from '$lib/map/types';

type DbAnnotationSet = Database['public']['Tables']['annotation_sets']['Row'];
type AnnotationSetInsert = Database['public']['Tables']['annotation_sets']['Insert'];
type AnnotationSetUpdate = Database['public']['Tables']['annotation_sets']['Update'];

function toAnnotationSet(row: DbAnnotationSet): AnnotationSet {
	return {
		id: row.id,
		title: row.title,
		mapId: row.map_id ?? '',
		authorId: row.user_id ?? '',
		features: row.features as unknown as AnnotationSet['features'],
		isPublic: row.is_public,
		createdAt: new Date(row.created_at).getTime(),
		updatedAt: new Date(row.updated_at).getTime()
	};
}

export async function fetchUserAnnotationSets(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<AnnotationSet[]> {
	const { data, error } = await supabase
		.from('annotation_sets')
		.select('*')
		.eq('user_id', userId)
		.order('updated_at', { ascending: false });

	if (error || !data) {
		console.error('Failed to fetch annotation sets:', error);
		return [];
	}

	return (data as DbAnnotationSet[]).map(toAnnotationSet);
}


export async function createAnnotationSet(
	supabase: SupabaseClient<Database>,
	params: {
		title: string;
		mapId: string;
		userId: string;
		features: object;
		isPublic: boolean;
	}
): Promise<string | null> {
	const { data, error } = await supabase
		.from('annotation_sets')
		.insert({
			title: params.title,
			map_id: params.mapId,
			user_id: params.userId,
			features: params.features,
			is_public: params.isPublic
		} as AnnotationSetInsert)
		.select('id')
		.single();

	if (error) {
		console.error('Failed to create annotation set:', error);
		return null;
	}

	return (data as { id: string }).id;
}

export async function updateAnnotationSet(
	supabase: SupabaseClient<Database>,
	id: string,
	updates: Partial<{
		title: string;
		features: object;
		is_public: boolean;
	}>
): Promise<boolean> {
	const { error } = await supabase
		.from('annotation_sets')
		.update({ ...updates, updated_at: new Date().toISOString() } as AnnotationSetUpdate)
		.eq('id', id);

	if (error) {
		console.error('Failed to update annotation set:', error);
		return false;
	}
	return true;
}

export async function deleteAnnotationSet(
	supabase: SupabaseClient<Database>,
	id: string
): Promise<boolean> {
	const { error } = await supabase
		.from('annotation_sets')
		.delete()
		.eq('id', id);

	if (error) {
		console.error('Failed to delete annotation set:', error);
		return false;
	}
	return true;
}
