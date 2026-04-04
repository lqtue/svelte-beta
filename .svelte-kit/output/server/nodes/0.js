import * as server from '../entries/pages/_layout.server.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { server };
export const server_id = "src/routes/+layout.server.ts";
export const imports = ["_app/immutable/nodes/0.cAeKd7V8.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CnbiO5J4.js","_app/immutable/chunks/BaBbQWDU.js","_app/immutable/chunks/5Eu1ykj-.js","_app/immutable/chunks/BAZTJ-Rb.js","_app/immutable/chunks/CdpG7C_E.js"];
export const stylesheets = ["_app/immutable/assets/0.CBtGQiVC.css"];
export const fonts = [];
