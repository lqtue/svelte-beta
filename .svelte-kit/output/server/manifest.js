export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.ico","favicon.png","icon-192.png","icon-512.png","manifest.json","robots.txt","sw.js"]),
	mimeTypes: {".png":"image/png",".json":"application/json",".txt":"text/plain",".js":"text/javascript"},
	_: {
		client: {start:"_app/immutable/entry/start.D3y6tNzc.js",app:"_app/immutable/entry/app.DJsW4nFv.js",imports:["_app/immutable/entry/start.D3y6tNzc.js","_app/immutable/chunks/DB88mmUq.js","_app/immutable/chunks/COy29HWL.js","_app/immutable/chunks/DezgiKfJ.js","_app/immutable/entry/app.DJsW4nFv.js","_app/immutable/chunks/PPVm8Dsz.js","_app/immutable/chunks/COy29HWL.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/ByhEiHbf.js","_app/immutable/chunks/m2V9rbtF.js","_app/immutable/chunks/nobbrJXm.js","_app/immutable/chunks/DezgiKfJ.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
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
			__memo(() => import('./nodes/11.js'))
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
				id: "/admin",
				pattern: /^\/admin\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/annotate",
				pattern: /^\/annotate\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
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
				id: "/api/admin/maps/[id]",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/_server.ts.js'))
			},
			{
				id: "/api/admin/maps/[id]/image",
				pattern: /^\/api\/admin\/maps\/([^/]+?)\/image\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/admin/maps/_id_/image/_server.ts.js'))
			},
			{
				id: "/auth/callback",
				pattern: /^\/auth\/callback\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/auth/callback/_server.ts.js'))
			},
			{
				id: "/catalog",
				pattern: /^\/catalog\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/contribute/georef",
				pattern: /^\/contribute\/georef\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/contribute/label",
				pattern: /^\/contribute\/label\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/create",
				pattern: /^\/create\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 9 },
				endpoint: null
			},
			{
				id: "/signup",
				pattern: /^\/signup\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 10 },
				endpoint: null
			},
			{
				id: "/view",
				pattern: /^\/view\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 11 },
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
