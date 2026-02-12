import * as server from '../entries/pages/_layout.server.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { server };
export const server_id = "src/routes/+layout.server.ts";
export const imports = ["_app/immutable/nodes/0.DwWiYXyZ.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/dcqfWOkF.js","_app/immutable/chunks/C5I8pgLa.js","_app/immutable/chunks/D7EcRDlo.js","_app/immutable/chunks/B28HNYst.js"];
export const stylesheets = ["_app/immutable/assets/0.QeV9ysCO.css"];
export const fonts = [];
