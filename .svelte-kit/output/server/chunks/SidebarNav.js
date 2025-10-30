import { W as getContext, Y as fallback, X as escape_html } from "./context.js";
import "@sveltejs/kit/internal";
import "./exports.js";
import "./utils.js";
import "clsx";
import "@sveltejs/kit/internal/server";
import "./state.svelte.js";
import { e as ensure_array_like, b as attr_class, a as attr, c as bind_props } from "./index2.js";
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function BottomNav($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let items = fallback($$props["items"], () => [], true);
    let onNavigate = fallback($$props["onNavigate"], null);
    $$renderer2.push(`<nav class="bottom-nav svelte-10hguwp" aria-label="Primary"><!--[-->`);
    const each_array = ensure_array_like(items);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let item = each_array[$$index];
      $$renderer2.push(`<button type="button"${attr_class("nav-item svelte-10hguwp", void 0, { "active": item.active, "disabled": item.disabled })}${attr("aria-current", item.active ? "page" : void 0)}${attr("disabled", item.disabled, true)}><span class="icon svelte-10hguwp" aria-hidden="true">${escape_html(item.icon)}</span> <span class="label">${escape_html(item.label)}</span></button>`);
    }
    $$renderer2.push(`<!--]--></nav>`);
    bind_props($$props, { items, onNavigate });
  });
}
function SidebarNav($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let title = fallback($$props["title"], "");
    let items = fallback($$props["items"], () => [], true);
    let onNavigate = fallback($$props["onNavigate"], null);
    $$renderer2.push(`<aside class="sidebar svelte-45rnuk"${attr("aria-label", title || void 0)}>`);
    if (title) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="sidebar-header svelte-45rnuk"><h2 class="svelte-45rnuk">${escape_html(title)}</h2></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <nav class="svelte-45rnuk"><ul class="svelte-45rnuk"><!--[-->`);
    const each_array = ensure_array_like(items);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let item = each_array[$$index];
      $$renderer2.push(`<li><button type="button"${attr_class("nav-link svelte-45rnuk", void 0, { "active": item.active, "disabled": item.disabled })}${attr("aria-current", item.active ? "page" : void 0)}${attr("disabled", item.disabled, true)}><span class="icon svelte-45rnuk" aria-hidden="true">${escape_html(item.icon)}</span> <span>${escape_html(item.label)}</span></button></li>`);
    }
    $$renderer2.push(`<!--]--></ul></nav></aside>`);
    bind_props($$props, { title, items, onNavigate });
  });
}
export {
  BottomNav as B,
  SidebarNav as S,
  page as p
};
