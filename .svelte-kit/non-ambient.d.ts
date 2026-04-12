
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
		RouteId(): "/" | "/about" | "/admin" | "/annotate" | "/api" | "/api/admin" | "/api/admin/footprints" | "/api/admin/maps" | "/api/admin/maps/fetch-iiif-metadata" | "/api/admin/maps/[id]" | "/api/admin/maps/[id]/annotation" | "/api/admin/maps/[id]/iiif-sources" | "/api/admin/maps/[id]/iiif-sources/[sourceId]" | "/api/admin/maps/[id]/image" | "/api/admin/upload-image" | "/api/contribute" | "/api/contribute/catalog" | "/api/contribute/catalog/[mapId]" | "/api/export" | "/api/export/footprints" | "/auth" | "/auth/callback" | "/blog" | "/blog/[slug]" | "/catalog" | "/contribute" | "/contribute/catalog" | "/contribute/georef" | "/contribute/label" | "/contribute/review" | "/create" | "/login" | "/signup" | "/view";
		RouteParams(): {
			"/api/admin/maps/[id]": { id: string };
			"/api/admin/maps/[id]/annotation": { id: string };
			"/api/admin/maps/[id]/iiif-sources": { id: string };
			"/api/admin/maps/[id]/iiif-sources/[sourceId]": { id: string; sourceId: string };
			"/api/admin/maps/[id]/image": { id: string };
			"/api/contribute/catalog/[mapId]": { mapId: string };
			"/blog/[slug]": { slug: string }
		};
		LayoutParams(): {
			"/": { id?: string; sourceId?: string; mapId?: string; slug?: string };
			"/about": Record<string, never>;
			"/admin": Record<string, never>;
			"/annotate": Record<string, never>;
			"/api": { id?: string; sourceId?: string; mapId?: string };
			"/api/admin": { id?: string; sourceId?: string };
			"/api/admin/footprints": Record<string, never>;
			"/api/admin/maps": { id?: string; sourceId?: string };
			"/api/admin/maps/fetch-iiif-metadata": Record<string, never>;
			"/api/admin/maps/[id]": { id: string; sourceId?: string };
			"/api/admin/maps/[id]/annotation": { id: string };
			"/api/admin/maps/[id]/iiif-sources": { id: string; sourceId?: string };
			"/api/admin/maps/[id]/iiif-sources/[sourceId]": { id: string; sourceId: string };
			"/api/admin/maps/[id]/image": { id: string };
			"/api/admin/upload-image": Record<string, never>;
			"/api/contribute": { mapId?: string };
			"/api/contribute/catalog": { mapId?: string };
			"/api/contribute/catalog/[mapId]": { mapId: string };
			"/api/export": Record<string, never>;
			"/api/export/footprints": Record<string, never>;
			"/auth": Record<string, never>;
			"/auth/callback": Record<string, never>;
			"/blog": { slug?: string };
			"/blog/[slug]": { slug: string };
			"/catalog": Record<string, never>;
			"/contribute": Record<string, never>;
			"/contribute/catalog": Record<string, never>;
			"/contribute/georef": Record<string, never>;
			"/contribute/label": Record<string, never>;
			"/contribute/review": Record<string, never>;
			"/create": Record<string, never>;
			"/login": Record<string, never>;
			"/signup": Record<string, never>;
			"/view": Record<string, never>
		};
		Pathname(): "/" | "/about" | "/about/" | "/admin" | "/admin/" | "/annotate" | "/annotate/" | "/api" | "/api/" | "/api/admin" | "/api/admin/" | "/api/admin/footprints" | "/api/admin/footprints/" | "/api/admin/maps" | "/api/admin/maps/" | "/api/admin/maps/fetch-iiif-metadata" | "/api/admin/maps/fetch-iiif-metadata/" | `/api/admin/maps/${string}` & {} | `/api/admin/maps/${string}/` & {} | `/api/admin/maps/${string}/annotation` & {} | `/api/admin/maps/${string}/annotation/` & {} | `/api/admin/maps/${string}/iiif-sources` & {} | `/api/admin/maps/${string}/iiif-sources/` & {} | `/api/admin/maps/${string}/iiif-sources/${string}` & {} | `/api/admin/maps/${string}/iiif-sources/${string}/` & {} | `/api/admin/maps/${string}/image` & {} | `/api/admin/maps/${string}/image/` & {} | "/api/admin/upload-image" | "/api/admin/upload-image/" | "/api/contribute" | "/api/contribute/" | "/api/contribute/catalog" | "/api/contribute/catalog/" | `/api/contribute/catalog/${string}` & {} | `/api/contribute/catalog/${string}/` & {} | "/api/export" | "/api/export/" | "/api/export/footprints" | "/api/export/footprints/" | "/auth" | "/auth/" | "/auth/callback" | "/auth/callback/" | "/blog" | "/blog/" | `/blog/${string}` & {} | `/blog/${string}/` & {} | "/catalog" | "/catalog/" | "/contribute" | "/contribute/" | "/contribute/catalog" | "/contribute/catalog/" | "/contribute/georef" | "/contribute/georef/" | "/contribute/label" | "/contribute/label/" | "/contribute/review" | "/contribute/review/" | "/create" | "/create/" | "/login" | "/login/" | "/signup" | "/signup/" | "/view" | "/view/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.ico" | "/favicon.png" | "/icon-192.png" | "/icon-512.png" | "/images/blog/vectorize-preview-plot.png" | "/manifest.json" | "/robots.txt" | "/sw.js" | string & {};
	}
}