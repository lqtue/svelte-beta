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
		client: {start:"_app/immutable/entry/start.DSkE9VSS.js",app:"_app/immutable/entry/app.OJtBCQq3.js",imports:["_app/immutable/entry/start.DSkE9VSS.js","_app/immutable/chunks/5Eu1ykj-.js","_app/immutable/chunks/CnbiO5J4.js","_app/immutable/chunks/BAZTJ-Rb.js","_app/immutable/entry/app.OJtBCQq3.js","_app/immutable/chunks/PPVm8Dsz.js","_app/immutable/chunks/CnbiO5J4.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DibtaENM.js","_app/immutable/chunks/DVCaYPMG.js","_app/immutable/chunks/CHSdlpUR.js","_app/immutable/chunks/CLuu_piM.js","_app/immutable/chunks/BAZTJ-Rb.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
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
			__memo(() => import('./nodes/16.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/about",
				pattern: /^\/about\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/admin",
				pattern: /^\/admin\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/admin/pipeline",
				pattern: /^\/admin\/pipeline\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/annotate",
				pattern: /^\/annotate\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
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
				id: "/api/admin/georef",
				pattern: /^\/api\/admin\/georef\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/georef/_server.ts.js'))
			},
			{
				id: "/api/admin/labels",
				pattern: /^\/api\/admin\/labels\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/labels/_server.ts.js'))
			},
			{
				id: "/api/admin/labels/[id]",
				pattern: /^\/api\/admin\/labels\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/labels/_id_/_server.ts.js'))
			},
			{
				id: "/api/admin/maps",
				pattern: /^\/api\/admin\/maps\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/bulk-datum-fix",
				pattern: /^\/api\/admin\/maps\/bulk-datum-fix\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/bulk-datum-fix/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/propagate-from-ref",
				pattern: /^\/api\/admin\/maps\/propagate-from-ref\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/propagate-from-ref/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/propagate-gcps",
				pattern: /^\/api\/admin\/maps\/propagate-gcps\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/propagate-gcps/_server.ts.js'))
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
				id: "/api/admin/maps/[id]/image",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/image\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/image/_server.ts.js'))
			},
			{
				id: "/api/admin/pipeline/annotate",
				pattern: /^\/api\/admin\/pipeline\/annotate\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/pipeline/annotate/_server.ts.js'))
			},
			{
				id: "/api/admin/pipeline/ia-upload",
				pattern: /^\/api\/admin\/pipeline\/ia-upload\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/pipeline/ia-upload/_server.ts.js'))
			},
			{
				id: "/api/admin/pipeline/index-sheets",
				pattern: /^\/api\/admin\/pipeline\/index-sheets\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/pipeline/index-sheets/_server.ts.js'))
			},
			{
				id: "/api/admin/pipeline/propagate-sheet",
				pattern: /^\/api\/admin\/pipeline\/propagate-sheet\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/pipeline/propagate-sheet/_server.ts.js'))
			},
			{
				id: "/api/admin/pipeline/seed-sheets",
				pattern: /^\/api\/admin\/pipeline\/seed-sheets\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/pipeline/seed-sheets/_server.ts.js'))
			},
			{
				id: "/api/admin/pipeline/select-seeds",
				pattern: /^\/api\/admin\/pipeline\/select-seeds\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/pipeline/select-seeds/_server.ts.js'))
			},
			{
				id: "/api/admin/pipeline/status",
				pattern: /^\/api\/admin\/pipeline\/status\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/pipeline/status/_server.ts.js'))
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
				id: "/blog",
				pattern: /^\/blog\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/blog/[slug]",
				pattern: /^\/blog\/([^/]+?)\/?$/,
				params: [{"name":"slug","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/catalog",
				pattern: /^\/catalog\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 9 },
				endpoint: null
			},
			{
				id: "/contribute/georef",
				pattern: /^\/contribute\/georef\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 10 },
				endpoint: null
			},
			{
				id: "/contribute/label",
				pattern: /^\/contribute\/label\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 11 },
				endpoint: null
			},
			{
				id: "/contribute/review",
				pattern: /^\/contribute\/review\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 12 },
				endpoint: null
			},
			{
				id: "/create",
				pattern: /^\/create\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 13 },
				endpoint: null
			},
			{
				id: "/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 14 },
				endpoint: null
			},
			{
				id: "/signup",
				pattern: /^\/signup\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 15 },
				endpoint: null
			},
			{
				id: "/view",
				pattern: /^\/view\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 16 },
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
