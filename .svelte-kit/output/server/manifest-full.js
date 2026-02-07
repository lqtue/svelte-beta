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
		client: {start:"_app/immutable/entry/start.B0hSCXJY.js",app:"_app/immutable/entry/app.BdjEnwbO.js",imports:["_app/immutable/entry/start.B0hSCXJY.js","_app/immutable/chunks/DPtGKd3c.js","_app/immutable/chunks/6ds4e1Hj.js","_app/immutable/chunks/obLiwMeQ.js","_app/immutable/chunks/ilhcaF4n.js","_app/immutable/entry/app.BdjEnwbO.js","_app/immutable/chunks/obLiwMeQ.js","_app/immutable/chunks/6ds4e1Hj.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/uRYNcqzp.js","_app/immutable/chunks/CeIZ_WK-.js","_app/immutable/chunks/ilhcaF4n.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js'))
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
