
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/(editorial)" | "/(app)" | "/" | "/(editorial)/about" | "/(app)/annotate" | "/api" | "/api/admin" | "/api/admin/footprints" | "/api/admin/maps" | "/api/admin/maps/fetch-iiif-metadata" | "/api/admin/maps/[id]" | "/api/admin/maps/[id]/annotation" | "/api/admin/maps/[id]/iiif-sources" | "/api/admin/maps/[id]/iiif-sources/[sourceId]" | "/api/admin/maps/[id]/image" | "/api/admin/maps/[id]/mirror-r2" | "/api/admin/maps/[id]/ocr-review" | "/api/admin/maps/[id]/ocr-review/revert-recent" | "/api/admin/maps/[id]/ocr" | "/api/admin/maps/[id]/ocr/apply" | "/api/admin/maps/[id]/pipeline" | "/api/admin/upload-image" | "/api/export" | "/api/export/footprints" | "/auth" | "/auth/callback" | "/(editorial)/blog" | "/(editorial)/blog/[slug]" | "/(editorial)/catalog" | "/contribute" | "/(editorial)/contribute" | "/(app)/contribute" | "/(app)/contribute/digitalize" | "/contribute/georef" | "/(editorial)/contribute/georef" | "/contribute/label" | "/(app)/contribute/label" | "/contribute/review" | "/(app)/contribute/trace" | "/(app)/create" | "/(app)/image" | "/(editorial)/login" | "/(editorial)/profile" | "/(app)/view";
		RouteParams(): {
			"/api/admin/maps/[id]": { id: string };
			"/api/admin/maps/[id]/annotation": { id: string };
			"/api/admin/maps/[id]/iiif-sources": { id: string };
			"/api/admin/maps/[id]/iiif-sources/[sourceId]": { id: string; sourceId: string };
			"/api/admin/maps/[id]/image": { id: string };
			"/api/admin/maps/[id]/mirror-r2": { id: string };
			"/api/admin/maps/[id]/ocr-review": { id: string };
			"/api/admin/maps/[id]/ocr-review/revert-recent": { id: string };
			"/api/admin/maps/[id]/ocr": { id: string };
			"/api/admin/maps/[id]/ocr/apply": { id: string };
			"/api/admin/maps/[id]/pipeline": { id: string };
			"/(editorial)/blog/[slug]": { slug: string }
		};
		LayoutParams(): {
			"/(editorial)": { slug?: string };
			"/(app)": Record<string, never>;
			"/": { id?: string; sourceId?: string; slug?: string };
			"/(editorial)/about": Record<string, never>;
			"/(app)/annotate": Record<string, never>;
			"/api": { id?: string; sourceId?: string };
			"/api/admin": { id?: string; sourceId?: string };
			"/api/admin/footprints": Record<string, never>;
			"/api/admin/maps": { id?: string; sourceId?: string };
			"/api/admin/maps/fetch-iiif-metadata": Record<string, never>;
			"/api/admin/maps/[id]": { id: string; sourceId?: string };
			"/api/admin/maps/[id]/annotation": { id: string };
			"/api/admin/maps/[id]/iiif-sources": { id: string; sourceId?: string };
			"/api/admin/maps/[id]/iiif-sources/[sourceId]": { id: string; sourceId: string };
			"/api/admin/maps/[id]/image": { id: string };
			"/api/admin/maps/[id]/mirror-r2": { id: string };
			"/api/admin/maps/[id]/ocr-review": { id: string };
			"/api/admin/maps/[id]/ocr-review/revert-recent": { id: string };
			"/api/admin/maps/[id]/ocr": { id: string };
			"/api/admin/maps/[id]/ocr/apply": { id: string };
			"/api/admin/maps/[id]/pipeline": { id: string };
			"/api/admin/upload-image": Record<string, never>;
			"/api/export": Record<string, never>;
			"/api/export/footprints": Record<string, never>;
			"/auth": Record<string, never>;
			"/auth/callback": Record<string, never>;
			"/(editorial)/blog": { slug?: string };
			"/(editorial)/blog/[slug]": { slug: string };
			"/(editorial)/catalog": Record<string, never>;
			"/contribute": Record<string, never>;
			"/(editorial)/contribute": Record<string, never>;
			"/(app)/contribute": Record<string, never>;
			"/(app)/contribute/digitalize": Record<string, never>;
			"/contribute/georef": Record<string, never>;
			"/(editorial)/contribute/georef": Record<string, never>;
			"/contribute/label": Record<string, never>;
			"/(app)/contribute/label": Record<string, never>;
			"/contribute/review": Record<string, never>;
			"/(app)/contribute/trace": Record<string, never>;
			"/(app)/create": Record<string, never>;
			"/(app)/image": Record<string, never>;
			"/(editorial)/login": Record<string, never>;
			"/(editorial)/profile": Record<string, never>;
			"/(app)/view": Record<string, never>
		};
		Pathname(): "/" | "/about" | "/about/" | "/annotate" | "/annotate/" | "/api" | "/api/" | "/api/admin" | "/api/admin/" | "/api/admin/footprints" | "/api/admin/footprints/" | "/api/admin/maps" | "/api/admin/maps/" | "/api/admin/maps/fetch-iiif-metadata" | "/api/admin/maps/fetch-iiif-metadata/" | `/api/admin/maps/${string}` & {} | `/api/admin/maps/${string}/` & {} | `/api/admin/maps/${string}/annotation` & {} | `/api/admin/maps/${string}/annotation/` & {} | `/api/admin/maps/${string}/iiif-sources` & {} | `/api/admin/maps/${string}/iiif-sources/` & {} | `/api/admin/maps/${string}/iiif-sources/${string}` & {} | `/api/admin/maps/${string}/iiif-sources/${string}/` & {} | `/api/admin/maps/${string}/image` & {} | `/api/admin/maps/${string}/image/` & {} | `/api/admin/maps/${string}/mirror-r2` & {} | `/api/admin/maps/${string}/mirror-r2/` & {} | `/api/admin/maps/${string}/ocr-review` & {} | `/api/admin/maps/${string}/ocr-review/` & {} | `/api/admin/maps/${string}/ocr-review/revert-recent` & {} | `/api/admin/maps/${string}/ocr-review/revert-recent/` & {} | `/api/admin/maps/${string}/ocr` & {} | `/api/admin/maps/${string}/ocr/` & {} | `/api/admin/maps/${string}/ocr/apply` & {} | `/api/admin/maps/${string}/ocr/apply/` & {} | `/api/admin/maps/${string}/pipeline` & {} | `/api/admin/maps/${string}/pipeline/` & {} | "/api/admin/upload-image" | "/api/admin/upload-image/" | "/api/export" | "/api/export/" | "/api/export/footprints" | "/api/export/footprints/" | "/auth" | "/auth/" | "/auth/callback" | "/auth/callback/" | "/blog" | "/blog/" | `/blog/${string}` & {} | `/blog/${string}/` & {} | "/catalog" | "/catalog/" | "/contribute" | "/contribute/" | "/contribute/digitalize" | "/contribute/digitalize/" | "/contribute/georef" | "/contribute/georef/" | "/contribute/label" | "/contribute/label/" | "/contribute/review" | "/contribute/review/" | "/contribute/trace" | "/contribute/trace/" | "/create" | "/create/" | "/image" | "/image/" | "/login" | "/login/" | "/profile" | "/profile/" | "/view" | "/view/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.ico" | "/favicon.png" | "/icon-192.png" | "/icon-512.png" | "/images/blog/vectorize-preview-plot.png" | "/manifest.json" | "/robots.txt" | "/sw.js" | string & {};
	}
}