
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
		RouteId(): "/" | "/annotate" | "/auth" | "/auth/callback" | "/catalog" | "/contribute" | "/contribute/georef" | "/contribute/label" | "/create" | "/georef" | "/hunt" | "/login" | "/shell" | "/signup" | "/studio" | "/trip" | "/view";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/annotate": Record<string, never>;
			"/auth": Record<string, never>;
			"/auth/callback": Record<string, never>;
			"/catalog": Record<string, never>;
			"/contribute": Record<string, never>;
			"/contribute/georef": Record<string, never>;
			"/contribute/label": Record<string, never>;
			"/create": Record<string, never>;
			"/georef": Record<string, never>;
			"/hunt": Record<string, never>;
			"/login": Record<string, never>;
			"/shell": Record<string, never>;
			"/signup": Record<string, never>;
			"/studio": Record<string, never>;
			"/trip": Record<string, never>;
			"/view": Record<string, never>
		};
		Pathname(): "/" | "/annotate" | "/annotate/" | "/auth" | "/auth/" | "/auth/callback" | "/auth/callback/" | "/catalog" | "/catalog/" | "/contribute" | "/contribute/" | "/contribute/georef" | "/contribute/georef/" | "/contribute/label" | "/contribute/label/" | "/create" | "/create/" | "/georef" | "/georef/" | "/hunt" | "/hunt/" | "/login" | "/login/" | "/shell" | "/shell/" | "/signup" | "/signup/" | "/studio" | "/studio/" | "/trip" | "/trip/" | "/view" | "/view/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.ico" | "/favicon.png" | "/manifest.json" | "/robots.txt" | "/sw.js" | string & {};
	}
}