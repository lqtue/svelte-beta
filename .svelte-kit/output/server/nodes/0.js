import * as server from '../entries/pages/_layout.server.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { server };
export const server_id = "src/routes/+layout.server.ts";
export const imports = ["_app/immutable/nodes/0.Du6-DW3V.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/COy29HWL.js","_app/immutable/chunks/DjrK7u_z.js","_app/immutable/chunks/DB88mmUq.js","_app/immutable/chunks/DezgiKfJ.js"];
export const stylesheets = ["_app/immutable/assets/0.BvEVajSC.css"];
export const fonts = [];
