// ---- Maps module — type definitions ----

export type MapSourceType = 'ia' | 'bnf' | 'efeo' | 'gallica' | 'rumsey' | 'self' | 'other';

/** A single IIIF image source for a map (map can have many). */
export interface MapIIIFSource {
  id: string;
  map_id: string;
  label?: string;            // e.g. "BnF Gallica", "Internet Archive"
  source_type?: MapSourceType;
  iiif_manifest?: string;
  iiif_image: string;        // image service base URL
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

/** Payload for adding a IIIF source to a map. */
export interface MapIIIFSourcePayload {
  label?: string;
  source_type?: MapSourceType;
  iiif_manifest?: string;
  iiif_image: string;
  is_primary?: boolean;
  sort_order?: number;
}
export type MapStatus = 'pending_georef' | 'georeferenced' | 'processing' | 'published';
export type MapType = 'cadastral' | 'topographic' | 'city_plan' | 'panorama' | 'other';

/** Full map record as stored in the database. */
export interface MapRecord {
  id: string;
  name: string;                  // display name (set by admin)
  location?: string;             // city / region (renamed from `type`)
  original_title?: string;       // title as in source / on the map
  creator?: string;
  year?: number;
  year_label?: string;           // e.g. "c. 1882", "1898–1902"
  language?: string;             // ISO 639-1
  rights?: string;
  dc_description?: string;       // dc:description (migrated from `summary`)
  thumbnail?: string;
  is_featured: boolean;

  // Source
  source_type?: MapSourceType;
  source_url?: string;           // canonical URL at institution
  collection?: string;           // e.g. "BnF Gallica", "EFEO"
  ia_identifier?: string;        // Internet Archive item ID

  // IIIF
  iiif_manifest?: string;        // manifest URL
  iiif_image?: string;           // image service base URL

  // Georeferencing
  allmaps_id?: string;           // Allmaps annotation URL (present once georeferenced)

  // Classification
  map_type?: MapType | string;
  bbox?: [number, number, number, number]; // [west, south, east, north]

  // Flexible custom metadata (schema-free JSONB)
  extra_metadata?: Record<string, string>;

  // Lifecycle
  status: MapStatus;

  created_at: string;
  updated_at?: string;
}

/** Lightweight item used in catalog lists and map selector dropdowns. */
export interface MapListItem {
  id: string;                    // maps.id (uuid)
  allmaps_id?: string;           // Allmaps annotation URL
  name: string;
  location?: string;             // city / region (renamed from `type`)
  map_type?: string;             // cartographic type: cadastral, topographic, city_plan, panorama
  dc_description?: string;       // dc:description (migrated from `summary`)
  thumbnail?: string;
  isFeatured?: boolean;
  year?: number;
  year_label?: string;
  collection?: string;
  source_type?: MapSourceType;
  status?: MapStatus;
  bbox?: [number, number, number, number];
  extra_metadata?: Record<string, string>;
}

/** Metadata extracted from a IIIF manifest. */
export interface IIIFManifestMeta {
  title?: string;           // actual descriptive title (from description/metadata["Title"])
  shelfmark?: string;       // archival call number (BnF label / metadata["Shelfmark"])
  creator?: string;
  date?: string;
  language?: string;
  rights?: string;
  attribution?: string;     // holding institution (manifest.attribution / BnF "Repository")
  sourceUrl?: string;       // canonical item page URL (manifest.related for BnF)
  physicalDescription?: string;  // format/dimensions from metadata["Format"]
  thumbnail?: string;
  imageServiceUrl?: string;    // IIIF image service base URL
  manifestVersion: 2 | 3;
}

/** Payload for creating a map via own-scan ingest (upload to IA). */
export interface MapIngestOwnScan {
  name: string;
  year?: number;
  location?: string;
  map_type?: string;
  collection?: string;
  dc_description?: string;
  // ia_identifier and iiif_image filled after upload
}

/** Payload for adding an external IIIF map (BnF, EFEO, etc.). */
export interface MapIngestExternal {
  name: string;
  source_type: MapSourceType;
  iiif_manifest: string;        // manifest URL to fetch metadata from
  source_url?: string;
  collection?: string;
  location?: string;
  // metadata fields filled from manifest
  original_title?: string;
  creator?: string;
  year?: number;
  year_label?: string;
  language?: string;
  rights?: string;
  thumbnail?: string;
  iiif_image?: string;
  map_type?: string;
  dc_description?: string;
}

/** Admin-editable fields for an existing map. */
export interface MapEditPayload {
  name?: string;
  location?: string;
  original_title?: string;
  creator?: string;
  year?: number;
  year_label?: string;
  language?: string;
  rights?: string;
  dc_description?: string;
  thumbnail?: string;
  is_featured?: boolean;
  source_type?: MapSourceType;
  source_url?: string;
  collection?: string;
  map_type?: string;
  bbox?: [number, number, number, number];
  status?: MapStatus;
  allmaps_id?: string;
  iiif_manifest?: string;
  iiif_image?: string;
  extra_metadata?: Record<string, string>;
}
