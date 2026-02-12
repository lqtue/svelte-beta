

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/admin/+page.ts";
export const imports = ["_app/immutable/nodes/3.CLe-9Jlh.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DAqcWgJQ.js","_app/immutable/chunks/COy29HWL.js","_app/immutable/chunks/ByhEiHbf.js","_app/immutable/chunks/BWsF3rHZ.js","_app/immutable/chunks/DjrK7u_z.js","_app/immutable/chunks/CzAFXcu7.js","_app/immutable/chunks/Cg4Xvy-O.js","_app/immutable/chunks/nobbrJXm.js","_app/immutable/chunks/DezgiKfJ.js"];
export const stylesheets = ["_app/immutable/assets/3.Cn2XENui.css"];
export const fonts = [];
