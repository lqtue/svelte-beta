import { generateId } from '@allmaps/id';

/**
 * Canonical form of a IIIF Image service URL for hashing.
 * Strips an optional trailing `/info.json` and any trailing slashes.
 */
export function canonicalIiifUrl(url: string): string {
	return url.replace(/\/(info\.json)?$/, '').replace(/\/+$/, '');
}

/**
 * Derive a 16-char Allmaps image ID (SHA-1 hex) from a IIIF Image service URL.
 * Wraps `@allmaps/id` so every call site shares one canonicalization step.
 */
export async function deriveAllmapsId(iiifImage: string): Promise<string> {
	return generateId(canonicalIiifUrl(iiifImage));
}
