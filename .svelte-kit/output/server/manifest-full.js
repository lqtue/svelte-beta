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
		client: {start:"_app/immutable/entry/start.C79mKIp-.js",app:"_app/immutable/entry/app.A0HmRYif.js",imports:["_app/immutable/entry/start.C79mKIp-.js","_app/immutable/chunks/D-pHkSQu.js","_app/immutable/chunks/Ch_7xMJZ.js","_app/immutable/chunks/DmKfOTeo.js","_app/immutable/entry/app.A0HmRYif.js","_app/immutable/chunks/DmKfOTeo.js","_app/immutable/chunks/Ch_7xMJZ.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DlFo6P2L.js","_app/immutable/chunks/B7pDVb1P.js","_app/immutable/chunks/CcWUXD1I.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js')),
			__memo(() => import('./nodes/6.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/create",
				pattern: /^\/create\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/view",
				pattern: /^\/view\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 6 },
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
