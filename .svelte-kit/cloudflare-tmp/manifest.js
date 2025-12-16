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
		client: {start:"_app/immutable/entry/start.DaAGhPYi.js",app:"_app/immutable/entry/app.EZymgsvh.js",imports:["_app/immutable/entry/start.DaAGhPYi.js","_app/immutable/chunks/CAe_Ou-x.js","_app/immutable/chunks/DMYoFwTQ.js","_app/immutable/chunks/CFLsuAxJ.js","_app/immutable/entry/app.EZymgsvh.js","_app/immutable/chunks/CFLsuAxJ.js","_app/immutable/chunks/DMYoFwTQ.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/ubKGujoG.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js'))
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
				id: "/trip",
				pattern: /^\/trip\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
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
