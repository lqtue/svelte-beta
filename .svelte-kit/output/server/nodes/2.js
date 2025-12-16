

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.Bg4zM9VN.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/ZgKF10oA.js","_app/immutable/chunks/CFLsuAxJ.js","_app/immutable/chunks/ubKGujoG.js","_app/immutable/chunks/DMYoFwTQ.js","_app/immutable/chunks/JEDPzHsJ.js","_app/immutable/chunks/B-hTwBeA.js"];
export const stylesheets = ["_app/immutable/assets/constants.BtPuoxOl.css","_app/immutable/assets/2.9P5P5mmd.css"];
export const fonts = [];
