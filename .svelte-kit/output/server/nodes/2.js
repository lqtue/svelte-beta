

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.JLcOByFt.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/D444ibiU.js","_app/immutable/chunks/BIWrGPwp.js","_app/immutable/chunks/CLAw4lq8.js","_app/immutable/chunks/bLLYHiUB.js","_app/immutable/chunks/DjeodknY.js","_app/immutable/chunks/CNuyH17j.js"];
export const stylesheets = ["_app/immutable/assets/2.CSh8h2Ha.css"];
export const fonts = [];
