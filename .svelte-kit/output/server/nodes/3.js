

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/admin/+page.ts";
export const imports = ["_app/immutable/nodes/3.BYd3bbRr.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/BWTQL1F0.js","_app/immutable/chunks/dcqfWOkF.js","_app/immutable/chunks/DIAGYPZC.js","_app/immutable/chunks/Bvz5TlUV.js","_app/immutable/chunks/C5I8pgLa.js","_app/immutable/chunks/6f6iuJWY.js","_app/immutable/chunks/DW3PyTzi.js","_app/immutable/chunks/CHp4D8iR.js","_app/immutable/chunks/B28HNYst.js"];
export const stylesheets = ["_app/immutable/assets/3.Cn2XENui.css"];
export const fonts = [];
