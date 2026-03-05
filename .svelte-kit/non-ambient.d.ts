
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
		RouteId(): "/" | "/admin" | "/annotate" | "/api" | "/api/admin" | "/api/admin/georef" | "/api/admin/labels" | "/api/admin/labels/[id]" | "/api/admin/maps" | "/api/admin/maps/[id]" | "/api/admin/maps/[id]/image" | "/api/admin/upload-image" | "/auth" | "/auth/callback" | "/catalog" | "/contribute" | "/contribute/georef" | "/contribute/label" | "/create" | "/login" | "/signup" | "/view" | "/vwai";
		RouteParams(): {
			"/api/admin/labels/[id]": { id: string };
			"/api/admin/maps/[id]": { id: string };
			"/api/admin/maps/[id]/image": { id: string }
		};
		LayoutParams(): {
			"/": { id?: string };
			"/admin": Record<string, never>;
			"/annotate": Record<string, never>;
			"/api": { id?: string };
			"/api/admin": { id?: string };
			"/api/admin/georef": Record<string, never>;
			"/api/admin/labels": { id?: string };
			"/api/admin/labels/[id]": { id: string };
			"/api/admin/maps": { id?: string };
			"/api/admin/maps/[id]": { id: string };
			"/api/admin/maps/[id]/image": { id: string };
			"/api/admin/upload-image": Record<string, never>;
			"/auth": Record<string, never>;
			"/auth/callback": Record<string, never>;
			"/catalog": Record<string, never>;
			"/contribute": Record<string, never>;
			"/contribute/georef": Record<string, never>;
			"/contribute/label": Record<string, never>;
			"/create": Record<string, never>;
			"/login": Record<string, never>;
			"/signup": Record<string, never>;
			"/view": Record<string, never>;
			"/vwai": Record<string, never>
		};
		Pathname(): "/" | "/admin" | "/admin/" | "/annotate" | "/annotate/" | "/api" | "/api/" | "/api/admin" | "/api/admin/" | "/api/admin/georef" | "/api/admin/georef/" | "/api/admin/labels" | "/api/admin/labels/" | `/api/admin/labels/${string}` & {} | `/api/admin/labels/${string}/` & {} | "/api/admin/maps" | "/api/admin/maps/" | `/api/admin/maps/${string}` & {} | `/api/admin/maps/${string}/` & {} | `/api/admin/maps/${string}/image` & {} | `/api/admin/maps/${string}/image/` & {} | "/api/admin/upload-image" | "/api/admin/upload-image/" | "/auth" | "/auth/" | "/auth/callback" | "/auth/callback/" | "/catalog" | "/catalog/" | "/contribute" | "/contribute/" | "/contribute/georef" | "/contribute/georef/" | "/contribute/label" | "/contribute/label/" | "/create" | "/create/" | "/login" | "/login/" | "/signup" | "/signup/" | "/view" | "/view/" | "/vwai" | "/vwai/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.ico" | "/favicon.png" | "/icon-192.png" | "/icon-512.png" | "/manifest.json" | "/robots.txt" | "/sw.js" | string & {};
	}
}