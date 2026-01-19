export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.ico","favicon.png","robots.txt","sw.js"]),
	mimeTypes: {".png":"image/png",".txt":"text/plain",".js":"text/javascript"},
	_: {
		client: {start:"_app/immutable/entry/start.C9nQ2rjb.js",app:"_app/immutable/entry/app.uDwlEBHL.js",imports:["_app/immutable/entry/start.C9nQ2rjb.js","_app/immutable/chunks/Ca7_EGNT.js","_app/immutable/chunks/CLAw4lq8.js","_app/immutable/chunks/BIWrGPwp.js","_app/immutable/chunks/CzxzY2VL.js","_app/immutable/entry/app.uDwlEBHL.js","_app/immutable/chunks/BIWrGPwp.js","_app/immutable/chunks/CLAw4lq8.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/bLLYHiUB.js","_app/immutable/chunks/7Y9Eh46m.js","_app/immutable/chunks/CzxzY2VL.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js')),
			__memo(() => import('../output/server/nodes/4.js'))
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
				id: "/temp-viewer",
				pattern: /^\/temp-viewer\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/trip",
				pattern: /^\/trip\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
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

export const prerendered = new Set([]);

export const base_path = "";
