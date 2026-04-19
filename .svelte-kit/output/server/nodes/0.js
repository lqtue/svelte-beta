import * as server from '../entries/pages/_layout.server.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { server };
export const server_id = "src/routes/+layout.server.ts";
export const imports = ["_app/immutable/nodes/0.C0R_Uyd5.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/B5MerJRl.js","_app/immutable/chunks/B9z2ZwV8.js","_app/immutable/chunks/BCSzwTYC.js","_app/immutable/chunks/CMsHy9zi.js","_app/immutable/chunks/D0iwhpLH.js","_app/immutable/chunks/9UIFMShj.js"];
export const stylesheets = ["_app/immutable/assets/0.iORhRnLT.css"];
export const fonts = [];
