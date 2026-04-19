export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.ico","favicon.png","icon-192.png","icon-512.png","images/blog/vectorize-preview-plot.png","manifest.json","robots.txt","sw.js"]),
	mimeTypes: {".png":"image/png",".json":"application/json",".txt":"text/plain",".js":"text/javascript"},
	_: {
		client: {start:"_app/immutable/entry/start.Cv_kUr0t.js",app:"_app/immutable/entry/app.DZlNWR8t.js",imports:["_app/immutable/entry/start.Cv_kUr0t.js","_app/immutable/chunks/CMsHy9zi.js","_app/immutable/chunks/B5MerJRl.js","_app/immutable/chunks/B9z2ZwV8.js","_app/immutable/chunks/D0iwhpLH.js","_app/immutable/entry/app.DZlNWR8t.js","_app/immutable/chunks/PPVm8Dsz.js","_app/immutable/chunks/B9z2ZwV8.js","_app/immutable/chunks/B5MerJRl.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/BrZszOTp.js","_app/immutable/chunks/X7wtVBrg.js","_app/immutable/chunks/_wdC1yWe.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js')),
			__memo(() => import('./nodes/6.js')),
			__memo(() => import('./nodes/7.js')),
			__memo(() => import('./nodes/8.js')),
			__memo(() => import('./nodes/9.js')),
			__memo(() => import('./nodes/10.js')),
			__memo(() => import('./nodes/11.js')),
			__memo(() => import('./nodes/12.js')),
			__memo(() => import('./nodes/13.js')),
			__memo(() => import('./nodes/14.js')),
			__memo(() => import('./nodes/15.js')),
			__memo(() => import('./nodes/16.js')),
			__memo(() => import('./nodes/17.js')),
			__memo(() => import('./nodes/18.js')),
			__memo(() => import('./nodes/19.js')),
			__memo(() => import('./nodes/20.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/(editorial)",
				pattern: /^\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 11 },
				endpoint: null
			},
			{
				id: "/(editorial)/about",
				pattern: /^\/about\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 12 },
				endpoint: null
			},
			{
				id: "/(app)/annotate",
				pattern: /^\/annotate\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/api/admin/footprints",
				pattern: /^\/api\/admin\/footprints\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/footprints/_server.ts.js'))
			},
			{
				id: "/api/admin/maps",
				pattern: /^\/api\/admin\/maps\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/fetch-iiif-metadata",
				pattern: /^\/api\/admin\/maps\/fetch-iiif-metadata\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/fetch-iiif-metadata/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/annotation",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/annotation\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/annotation/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/iiif-sources",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/iiif-sources\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/iiif-sources/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/iiif-sources/[sourceId]",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/iiif-sources\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false},{"name":"sourceId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/iiif-sources/_sourceId_/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/image",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/image\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/image/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/mirror-r2",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/mirror-r2\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/mirror-r2/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/ocr-review",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/ocr-review\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/ocr-review/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/ocr-review/revert-recent",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/ocr-review\/revert-recent\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/ocr-review/revert-recent/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/ocr",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/ocr\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/ocr/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/ocr/apply",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/ocr\/apply\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/ocr/apply/_server.ts.js'))
			},
			{
				id: "/api/admin/upload-image",
				pattern: /^\/api\/admin\/upload-image\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/upload-image/_server.ts.js'))
			},
			{
				id: "/api/export/footprints",
				pattern: /^\/api\/export\/footprints\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/export/footprints/_server.ts.js'))
			},
			{
				id: "/auth/callback",
				pattern: /^\/auth\/callback\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/auth/callback/_server.ts.js'))
			},
			{
				id: "/(editorial)/blog",
				pattern: /^\/blog\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 13 },
				endpoint: null
			},
			{
				id: "/(editorial)/blog/[slug]",
				pattern: /^\/blog\/([^/]+?)\/?$/,
				params: [{"name":"slug","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,3,], errors: [1,,], leaf: 14 },
				endpoint: null
			},
			{
				id: "/(editorial)/catalog",
				pattern: /^\/catalog\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 15 },
				endpoint: null
			},
			{
				id: "/(editorial)/contribute",
				pattern: /^\/contribute\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 16 },
				endpoint: null
			},
			{
				id: "/(app)/contribute/digitalize",
				pattern: /^\/contribute\/digitalize\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/(editorial)/contribute/georef",
				pattern: /^\/contribute\/georef\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 17 },
				endpoint: null
			},
			{
				id: "/(app)/contribute/label",
				pattern: /^\/contribute\/label\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/contribute/review",
				pattern: /^\/contribute\/review\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 20 },
				endpoint: null
			},
			{
				id: "/(app)/contribute/trace",
				pattern: /^\/contribute\/trace\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/(app)/create",
				pattern: /^\/create\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/(app)/image",
				pattern: /^\/image\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 9 },
				endpoint: null
			},
			{
				id: "/(editorial)/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 18 },
				endpoint: null
			},
			{
				id: "/(editorial)/profile",
				pattern: /^\/profile\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 19 },
				endpoint: null
			},
			{
				id: "/(app)/view",
				pattern: /^\/view\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 10 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
