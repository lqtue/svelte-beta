

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.Cl7PPp2x.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DAkKJoAb.js","_app/immutable/chunks/Dx9j8vTj.js","_app/immutable/chunks/C6zSzz5v.js","_app/immutable/chunks/CnodKrVf.js","_app/immutable/chunks/CIg0wFg8.js"];
export const stylesheets = ["_app/immutable/assets/2.DXq88GMQ.css"];
export const fonts = [];
