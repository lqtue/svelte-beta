

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.CPavbu1W.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/GqXTuPwY.js","_app/immutable/chunks/Cdb2xRXm.js","_app/immutable/chunks/Bxuqzczs.js","_app/immutable/chunks/Dv3xk6mX.js","_app/immutable/chunks/D3BECx_u.js"];
export const stylesheets = ["_app/immutable/assets/2.EahlnP_7.css"];
export const fonts = [];
