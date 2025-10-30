

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/4.DKNasrTJ.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CVeh0obE.js","_app/immutable/chunks/DmKfOTeo.js","_app/immutable/chunks/Ch_7xMJZ.js","_app/immutable/chunks/q2JeGk3q.js","_app/immutable/chunks/D-pHkSQu.js","_app/immutable/chunks/CyJPgw3D.js","_app/immutable/chunks/CcWUXD1I.js","_app/immutable/chunks/B62UVDqu.js"];
export const stylesheets = ["_app/immutable/assets/breakpoints.yzSdU6gv.css","_app/immutable/assets/4.BkziFlwD.css"];
export const fonts = [];
