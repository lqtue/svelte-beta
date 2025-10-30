export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["robots.txt"]),
	mimeTypes: {".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.DfLePekn.js",app:"_app/immutable/entry/app.BqLUHMM7.js",imports:["_app/immutable/entry/start.DfLePekn.js","_app/immutable/chunks/CIMrQ6kB.js","_app/immutable/chunks/Bxuqzczs.js","_app/immutable/chunks/Cdb2xRXm.js","_app/immutable/entry/app.BqLUHMM7.js","_app/immutable/chunks/Cdb2xRXm.js","_app/immutable/chunks/Bxuqzczs.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Dv3xk6mX.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js'))
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
