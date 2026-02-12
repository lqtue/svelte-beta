

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.DdbZnMXZ.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/BWTQL1F0.js","_app/immutable/chunks/dcqfWOkF.js","_app/immutable/chunks/DIAGYPZC.js","_app/immutable/chunks/Bvz5TlUV.js","_app/immutable/chunks/C5I8pgLa.js","_app/immutable/chunks/BSQeze3F.js","_app/immutable/chunks/BqlTOgs2.js","_app/immutable/chunks/CvFblwoI.js"];
export const stylesheets = ["_app/immutable/assets/2.C7siE-He.css"];
export const fonts = [];
