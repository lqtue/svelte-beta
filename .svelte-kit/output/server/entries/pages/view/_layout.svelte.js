import { s as store_get, u as unsubscribe_stores } from "../../../chunks/index2.js";
import { S as SidebarNav, B as BottomNav, p as page } from "../../../chunks/SidebarNav.js";
import { s as screen } from "../../../chunks/breakpoints.js";
import { m as modeStore } from "../../../chunks/mode.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const baseItems = [
      { label: "Stories", icon: "📚", href: "/view" },
      {
        label: "Maps",
        icon: "🗺️",
        href: "/view/maps",
        disabled: true
      },
      {
        label: "Saved",
        icon: "❤️",
        href: "/view/saved",
        disabled: true
      },
      {
        label: "More",
        icon: "⚙️",
        href: "/view/more",
        disabled: true
      }
    ];
    const computeItems = (pathname) => baseItems.map((item) => ({ ...item, active: pathname === item.href }));
    modeStore.set("view");
    let { children } = $$props;
    if (store_get($$store_subs ??= {}, "$screen", screen).isDesktop) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="view-shell desktop svelte-px7o6d">`);
      SidebarNav($$renderer2, {
        title: "View Mode",
        items: computeItems(store_get($$store_subs ??= {}, "$page", page).url.pathname)
      });
      $$renderer2.push(`<!----> <div class="desktop-body svelte-px7o6d"><header class="desktop-header svelte-px7o6d"><div><h1 class="svelte-px7o6d">Stories</h1> <p class="svelte-px7o6d">Explore curated narratives from the Vietnam Map Archive.</p></div> <button type="button" class="header-action svelte-px7o6d" disabled>Search (soon)</button></header> <div class="desktop-content svelte-px7o6d">`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      if (store_get($$store_subs ??= {}, "$screen", screen).isTablet) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="view-shell tablet svelte-px7o6d"><aside class="drawer svelte-px7o6d">`);
        SidebarNav($$renderer2, {
          title: "View Mode",
          items: computeItems(store_get($$store_subs ??= {}, "$page", page).url.pathname)
        });
        $$renderer2.push(`<!----></aside> <div class="tablet-main svelte-px7o6d"><header class="tablet-header svelte-px7o6d"><h1 class="svelte-px7o6d">Stories</h1> <button type="button" disabled class="svelte-px7o6d">Search</button></header> <div class="tablet-content svelte-px7o6d">`);
        children?.($$renderer2);
        $$renderer2.push(`<!----></div> `);
        BottomNav($$renderer2, {
          items: computeItems(store_get($$store_subs ??= {}, "$page", page).url.pathname)
        });
        $$renderer2.push(`<!----></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="view-shell mobile svelte-px7o6d"><header class="mobile-header svelte-px7o6d"><button type="button" class="icon-button svelte-px7o6d" disabled>☰</button> <h1 class="svelte-px7o6d">Stories</h1> <button type="button" class="icon-button svelte-px7o6d" disabled>⚙️</button></header> <div class="mobile-content svelte-px7o6d">`);
        children?.($$renderer2);
        $$renderer2.push(`<!----></div> `);
        BottomNav($$renderer2, {
          items: computeItems(store_get($$store_subs ??= {}, "$page", page).url.pathname)
        });
        $$renderer2.push(`<!----></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]-->`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _layout as default
};
