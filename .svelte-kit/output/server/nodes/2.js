

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.CK7_ifFV.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DAqcWgJQ.js","_app/immutable/chunks/COy29HWL.js","_app/immutable/chunks/ByhEiHbf.js","_app/immutable/chunks/BWsF3rHZ.js","_app/immutable/chunks/DjrK7u_z.js","_app/immutable/chunks/DxkUhP4x.js","_app/immutable/chunks/BqlTOgs2.js","_app/immutable/chunks/CvFblwoI.js"];
export const stylesheets = ["_app/immutable/assets/2.DtX0AVXN.css"];
export const fonts = [];
