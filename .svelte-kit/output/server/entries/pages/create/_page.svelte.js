import { s as store_get, u as unsubscribe_stores } from "../../../chunks/index2.js";
import { M as MapViewport } from "../../../chunks/MapViewport.js";
import { s as screen } from "../../../chunks/breakpoints.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let layout;
    layout = store_get($$store_subs ??= {}, "$screen", screen).isDesktop ? "desktop" : store_get($$store_subs ??= {}, "$screen", screen).isTablet ? "tablet" : "mobile";
    $$renderer2.push(`<div class="create-map-area svelte-jztt4t">`);
    MapViewport($$renderer2, { initialMode: "create", showWelcomeOverlay: false, layout });
    $$renderer2.push(`<!----></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
