

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.WHlDI9qe.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CUqaGiYm.js","_app/immutable/chunks/obLiwMeQ.js","_app/immutable/chunks/6ds4e1Hj.js","_app/immutable/chunks/uRYNcqzp.js","_app/immutable/chunks/iPpcYJ_L.js","_app/immutable/chunks/d6K977q5.js"];
export const stylesheets = ["_app/immutable/assets/2.CSh8h2Ha.css"];
export const fonts = [];
