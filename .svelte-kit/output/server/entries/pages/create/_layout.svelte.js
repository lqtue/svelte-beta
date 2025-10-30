import { s as store_get, u as unsubscribe_stores } from "../../../chunks/index2.js";
import { S as SidebarNav, B as BottomNav, p as page } from "../../../chunks/SidebarNav.js";
import { s as screen } from "../../../chunks/breakpoints.js";
import { m as modeStore } from "../../../chunks/mode.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const baseItems = [
      { label: "Map", icon: "🗺️", href: "/create" },
      {
        label: "Pins",
        icon: "📍",
        href: "/create/pins",
        disabled: true
      },
      {
        label: "Story",
        icon: "📖",
        href: "/create/story",
        disabled: true
      },
      {
        label: "More",
        icon: "⋮",
        href: "/create/more",
        disabled: true
      }
    ];
    const computeItems = (pathname) => baseItems.map((item) => ({ ...item, active: pathname === item.href }));
    modeStore.set("create");
    let { children } = $$props;
    if (store_get($$store_subs ??= {}, "$screen", screen).isDesktop) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="create-shell desktop svelte-1l9f1ei">`);
      SidebarNav($$renderer2, {
        title: "Create Mode",
        items: computeItems(store_get($$store_subs ??= {}, "$page", page).url.pathname)
      });
      $$renderer2.push(`<!----> <div class="workspace svelte-1l9f1ei"><header class="workspace-header svelte-1l9f1ei"><div><h1 class="svelte-1l9f1ei">Workspace</h1> <p class="svelte-1l9f1ei">Build custom map stories with annotations and scenes.</p></div> <div class="toolbar svelte-1l9f1ei"><button type="button" disabled class="svelte-1l9f1ei">New Project</button> <button type="button" disabled class="svelte-1l9f1ei">Load Project</button> <button type="button" class="primary svelte-1l9f1ei" disabled>Save</button></div></header> <div class="workspace-body svelte-1l9f1ei">`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      if (store_get($$store_subs ??= {}, "$screen", screen).isTablet) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="create-shell tablet svelte-1l9f1ei"><aside class="drawer svelte-1l9f1ei">`);
        SidebarNav($$renderer2, {
          title: "Create Mode",
          items: computeItems(store_get($$store_subs ??= {}, "$page", page).url.pathname)
        });
        $$renderer2.push(`<!----></aside> <div class="tablet-body svelte-1l9f1ei"><header class="tablet-header svelte-1l9f1ei"><h1 class="svelte-1l9f1ei">Workspace</h1> <button type="button" disabled class="svelte-1l9f1ei">Project Actions</button></header> <div class="tablet-canvas svelte-1l9f1ei">`);
        children?.($$renderer2);
        $$renderer2.push(`<!----></div> `);
        BottomNav($$renderer2, {
          items: computeItems(store_get($$store_subs ??= {}, "$page", page).url.pathname)
        });
        $$renderer2.push(`<!----></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="create-shell mobile svelte-1l9f1ei"><header class="mobile-header svelte-1l9f1ei"><h1 class="svelte-1l9f1ei">Create</h1> <button type="button" disabled class="svelte-1l9f1ei">Tools</button></header> <div class="mobile-canvas svelte-1l9f1ei">`);
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
