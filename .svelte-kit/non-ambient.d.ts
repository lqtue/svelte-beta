
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
		RouteId(): "/" | "/about" | "/admin" | "/admin/pipeline" | "/annotate" | "/api" | "/api/admin" | "/api/admin/footprints" | "/api/admin/georef" | "/api/admin/labels" | "/api/admin/labels/[id]" | "/api/admin/maps" | "/api/admin/maps/annotation-id" | "/api/admin/maps/annotation-id/annotation" | "/api/admin/maps/bulk-datum-fix" | "/api/admin/maps/propagate-from-ref" | "/api/admin/maps/propagate-gcps" | "/api/admin/maps/[id]" | "/api/admin/maps/[id]/annotation" | "/api/admin/maps/[id]/image" | "/api/admin/pipeline" | "/api/admin/pipeline/annotate" | "/api/admin/pipeline/ia-upload" | "/api/admin/pipeline/index-sheets" | "/api/admin/pipeline/propagate-sheet" | "/api/admin/pipeline/seed-sheets" | "/api/admin/pipeline/select-seeds" | "/api/admin/pipeline/status" | "/api/admin/upload-image" | "/api/export" | "/api/export/footprints" | "/auth" | "/auth/callback" | "/blog" | "/blog/[slug]" | "/catalog" | "/contribute" | "/contribute/georef" | "/contribute/label" | "/contribute/review" | "/create" | "/login" | "/signup" | "/view";
		RouteParams(): {
			"/api/admin/labels/[id]": { id: string };
			"/api/admin/maps/[id]": { id: string };
			"/api/admin/maps/[id]/annotation": { id: string };
			"/api/admin/maps/[id]/image": { id: string };
			"/blog/[slug]": { slug: string }
		};
		LayoutParams(): {
			"/": { id?: string; slug?: string };
			"/about": Record<string, never>;
			"/admin": Record<string, never>;
			"/admin/pipeline": Record<string, never>;
			"/annotate": Record<string, never>;
			"/api": { id?: string };
			"/api/admin": { id?: string };
			"/api/admin/footprints": Record<string, never>;
			"/api/admin/georef": Record<string, never>;
			"/api/admin/labels": { id?: string };
			"/api/admin/labels/[id]": { id: string };
			"/api/admin/maps": { id?: string };
			"/api/admin/maps/annotation-id": Record<string, never>;
			"/api/admin/maps/annotation-id/annotation": Record<string, never>;
			"/api/admin/maps/bulk-datum-fix": Record<string, never>;
			"/api/admin/maps/propagate-from-ref": Record<string, never>;
			"/api/admin/maps/propagate-gcps": Record<string, never>;
			"/api/admin/maps/[id]": { id: string };
			"/api/admin/maps/[id]/annotation": { id: string };
			"/api/admin/maps/[id]/image": { id: string };
			"/api/admin/pipeline": Record<string, never>;
			"/api/admin/pipeline/annotate": Record<string, never>;
			"/api/admin/pipeline/ia-upload": Record<string, never>;
			"/api/admin/pipeline/index-sheets": Record<string, never>;
			"/api/admin/pipeline/propagate-sheet": Record<string, never>;
			"/api/admin/pipeline/seed-sheets": Record<string, never>;
			"/api/admin/pipeline/select-seeds": Record<string, never>;
			"/api/admin/pipeline/status": Record<string, never>;
			"/api/admin/upload-image": Record<string, never>;
			"/api/export": Record<string, never>;
			"/api/export/footprints": Record<string, never>;
			"/auth": Record<string, never>;
			"/auth/callback": Record<string, never>;
			"/blog": { slug?: string };
			"/blog/[slug]": { slug: string };
			"/catalog": Record<string, never>;
			"/contribute": Record<string, never>;
			"/contribute/georef": Record<string, never>;
			"/contribute/label": Record<string, never>;
			"/contribute/review": Record<string, never>;
			"/create": Record<string, never>;
			"/login": Record<string, never>;
			"/signup": Record<string, never>;
			"/view": Record<string, never>
		};
		Pathname(): "/" | "/about" | "/about/" | "/admin" | "/admin/" | "/admin/pipeline" | "/admin/pipeline/" | "/annotate" | "/annotate/" | "/api" | "/api/" | "/api/admin" | "/api/admin/" | "/api/admin/footprints" | "/api/admin/footprints/" | "/api/admin/georef" | "/api/admin/georef/" | "/api/admin/labels" | "/api/admin/labels/" | `/api/admin/labels/${string}` & {} | `/api/admin/labels/${string}/` & {} | "/api/admin/maps" | "/api/admin/maps/" | "/api/admin/maps/annotation-id" | "/api/admin/maps/annotation-id/" | "/api/admin/maps/annotation-id/annotation" | "/api/admin/maps/annotation-id/annotation/" | "/api/admin/maps/bulk-datum-fix" | "/api/admin/maps/bulk-datum-fix/" | "/api/admin/maps/propagate-from-ref" | "/api/admin/maps/propagate-from-ref/" | "/api/admin/maps/propagate-gcps" | "/api/admin/maps/propagate-gcps/" | `/api/admin/maps/${string}` & {} | `/api/admin/maps/${string}/` & {} | `/api/admin/maps/${string}/annotation` & {} | `/api/admin/maps/${string}/annotation/` & {} | `/api/admin/maps/${string}/image` & {} | `/api/admin/maps/${string}/image/` & {} | "/api/admin/pipeline" | "/api/admin/pipeline/" | "/api/admin/pipeline/annotate" | "/api/admin/pipeline/annotate/" | "/api/admin/pipeline/ia-upload" | "/api/admin/pipeline/ia-upload/" | "/api/admin/pipeline/index-sheets" | "/api/admin/pipeline/index-sheets/" | "/api/admin/pipeline/propagate-sheet" | "/api/admin/pipeline/propagate-sheet/" | "/api/admin/pipeline/seed-sheets" | "/api/admin/pipeline/seed-sheets/" | "/api/admin/pipeline/select-seeds" | "/api/admin/pipeline/select-seeds/" | "/api/admin/pipeline/status" | "/api/admin/pipeline/status/" | "/api/admin/upload-image" | "/api/admin/upload-image/" | "/api/export" | "/api/export/" | "/api/export/footprints" | "/api/export/footprints/" | "/auth" | "/auth/" | "/auth/callback" | "/auth/callback/" | "/blog" | "/blog/" | `/blog/${string}` & {} | `/blog/${string}/` & {} | "/catalog" | "/catalog/" | "/contribute" | "/contribute/" | "/contribute/georef" | "/contribute/georef/" | "/contribute/label" | "/contribute/label/" | "/contribute/review" | "/contribute/review/" | "/create" | "/create/" | "/login" | "/login/" | "/signup" | "/signup/" | "/view" | "/view/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.ico" | "/favicon.png" | "/icon-192.png" | "/icon-512.png" | "/images/blog/vectorize-preview-plot.png" | "/manifest.json" | "/robots.txt" | "/sw.js" | string & {};
	}
}