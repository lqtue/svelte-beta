import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

type GeorefSubmission = Database['public']['Tables']['georef_submissions']['Row'];

export type GeorefSubmissionWithProfile = GeorefSubmission & {
	submitted_by_profile: { display_name: string | null } | null;
};

async function attachProfiles(
	supabase: SupabaseClient<Database>,
	submissions: GeorefSubmission[]
): Promise<GeorefSubmissionWithProfile[]> {
	const userIds = [...new Set(submissions.map((s) => s.submitted_by).filter(Boolean))] as string[];
	if (userIds.length === 0) {
		return submissions.map((s) => ({ ...s, submitted_by_profile: null }));
	}

	const { data: profiles } = await supabase
		.from('profiles')
		.select('id, display_name')
		.in('id', userIds);

	const profileMap = new Map((profiles || []).map((p) => [p.id, p.display_name]));

	return submissions.map((s) => ({
		...s,
		submitted_by_profile: s.submitted_by
			? { display_name: profileMap.get(s.submitted_by) ?? null }
			: null
	}));
}

export async function fetchOpenSubmissions(
	supabase: SupabaseClient<Database>
): Promise<GeorefSubmissionWithProfile[]> {
	const { data, error } = await supabase
		.from('georef_submissions')
		.select('*')
		.in('status', ['open', 'in_progress'])
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Failed to fetch open submissions:', error);
		return [];
	}
	return attachProfiles(supabase, data as unknown as GeorefSubmission[]);
}

export async function fetchAllSubmissions(
	supabase: SupabaseClient<Database>
): Promise<GeorefSubmissionWithProfile[]> {
	const { data, error } = await supabase
		.from('georef_submissions')
		.select('*')
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Failed to fetch all submissions:', error);
		return [];
	}
	return attachProfiles(supabase, data as unknown as GeorefSubmission[]);
}

export async function createSubmission(
	supabase: SupabaseClient<Database>,
	submission: { iiif_url: string; name: string; description?: string }
): Promise<{ data: GeorefSubmission | null; error: string | null }> {
	const { data, error } = await supabase
		.from('georef_submissions')
		.insert({
			iiif_url: submission.iiif_url,
			name: submission.name,
			description: submission.description || null
		})
		.select()
		.single();

	if (error) {
		return { data: null, error: error.message };
	}
	return { data: data as unknown as GeorefSubmission, error: null };
}

export async function claimSubmission(
	supabase: SupabaseClient<Database>,
	id: string,
	userId: string
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from('georef_submissions')
		.update({
			status: 'in_progress' as const,
			submitted_by: userId,
			updated_at: new Date().toISOString()
		})
		.eq('id', id);

	if (error) return { error: error.message };
	return { error: null };
}

export async function submitForReview(
	supabase: SupabaseClient<Database>,
	id: string,
	allmapsId: string
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from('georef_submissions')
		.update({
			status: 'review_needed' as const,
			allmaps_id: allmapsId,
			updated_at: new Date().toISOString()
		})
		.eq('id', id);

	if (error) return { error: error.message };
	return { error: null };
}

export async function approveSubmission(
	supabase: SupabaseClient<Database>,
	id: string,
	submission: GeorefSubmission,
	mapDetails: { type: string; year: number | null }
): Promise<{ error: string | null }> {
	// Insert into main maps table
	const { error: insertError } = await supabase.from('maps').insert({
		allmaps_id: submission.allmaps_id!,
		name: submission.name,
		type: mapDetails.type || null,
		year: mapDetails.year,
		description: submission.description || null
	});

	if (insertError) return { error: insertError.message };

	// Update submission status
	const { error: updateError } = await supabase
		.from('georef_submissions')
		.update({
			status: 'approved' as const,
			updated_at: new Date().toISOString()
		})
		.eq('id', id);

	if (updateError) return { error: updateError.message };
	return { error: null };
}

export async function rejectSubmission(
	supabase: SupabaseClient<Database>,
	id: string,
	notes: string
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from('georef_submissions')
		.update({
			status: 'rejected' as const,
			admin_notes: notes,
			// Reset so someone else can try
			submitted_by: null,
			allmaps_id: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', id);

	if (error) return { error: error.message };
	return { error: null };
}

export async function deleteSubmission(
	supabase: SupabaseClient<Database>,
	id: string
): Promise<{ error: string | null }> {
	const { error } = await supabase.from('georef_submissions').delete().eq('id', id);

	if (error) return { error: error.message };
	return { error: null };
}

/**
 * Check if an Allmaps annotation exists for a given IIIF URL.
 * Returns the allmaps_id if found, null otherwise.
 */
export async function checkAllmapsAnnotation(
	iiifUrl: string
): Promise<{ allmapsId: string | null; error: string | null }> {
	try {
		const response = await fetch(
			`https://annotations.allmaps.org/?url=${encodeURIComponent(iiifUrl)}`
		);

		if (!response.ok) {
			return { allmapsId: null, error: null }; // No annotation yet
		}

		const annotation = await response.json();

		// Extract the allmaps_id from the annotation
		// The annotation @id is like "https://annotations.allmaps.org/manifests/{id}"
		const id = annotation['@id'] || annotation.id || '';
		const match = id.match(/\/([a-f0-9]+)$/);
		if (match) {
			return { allmapsId: match[1], error: null };
		}

		// Try to get it from items
		if (annotation.items && annotation.items.length > 0) {
			const itemId = annotation.items[0]?.['@id'] || annotation.items[0]?.id || '';
			const itemMatch = itemId.match(/\/([a-f0-9]+)$/);
			if (itemMatch) {
				return { allmapsId: itemMatch[1], error: null };
			}
		}

		// If we got a response but can't parse the ID, still consider it found
		return { allmapsId: 'unknown', error: null };
	} catch (err) {
		return { allmapsId: null, error: `Failed to check Allmaps: ${err}` };
	}
}
