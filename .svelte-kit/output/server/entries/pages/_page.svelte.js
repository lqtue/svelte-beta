import { d as sanitize_props, f as rest_props, g as element, c as bind_props, j as slot, k as attributes, l as clsx, e as ensure_array_like } from "../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import { Y as fallback, X as escape_html } from "../../chunks/context.js";
import "clsx";
import "@sveltejs/kit/internal/server";
import "../../chunks/state.svelte.js";
import "../../chunks/breakpoints.js";
import "../../chunks/mode.js";
function Container($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  const $$restProps = rest_props($$sanitized_props, ["as", "size", "padding", "className", "style"]);
  $$renderer.component(($$renderer2) => {
    let classes, styles;
    const sizes = {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      full: "100%"
    };
    let as = fallback($$props["as"], "div");
    let size = fallback($$props["size"], "lg");
    let padding = fallback($$props["padding"], "var(--space-6)");
    let className = fallback($$props["className"], "");
    let style = fallback($$props["style"], void 0);
    const resolveSize = (value) => value in sizes ? sizes[value] : value;
    classes = ["container", className, $$sanitized_props.class].filter(Boolean).join(" ");
    styles = [
      style,
      $$sanitized_props.style,
      `--container-max:${resolveSize(size)}`,
      `--container-padding:${padding}`
    ].filter(Boolean).join(";");
    element(
      $$renderer2,
      as,
      () => {
        $$renderer2.push(`${attributes({ ...$$restProps, class: clsx(classes), style: styles }, "svelte-11wbhul")}`);
      },
      () => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      }
    );
    bind_props($$props, { as, size, padding, className, style });
  });
}
function Stack($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  const $$restProps = rest_props($$sanitized_props, [
    "as",
    "gap",
    "align",
    "justify",
    "wrap",
    "className",
    "style"
  ]);
  $$renderer.component(($$renderer2) => {
    let resolvedAlign, resolvedJustify, classes, styles;
    const alignments = {
      start: "flex-start",
      center: "center",
      end: "flex-end",
      stretch: "stretch",
      baseline: "baseline"
    };
    const justifications = {
      start: "flex-start",
      center: "center",
      end: "flex-end",
      between: "space-between",
      around: "space-around",
      evenly: "space-evenly"
    };
    let as = fallback($$props["as"], "div");
    let gap = fallback($$props["gap"], "var(--space-4)");
    let align = fallback($$props["align"], "stretch");
    let justify = fallback($$props["justify"], "start");
    let wrap = fallback($$props["wrap"], false);
    let className = fallback($$props["className"], "");
    let style = fallback($$props["style"], void 0);
    const resolve = (map, value) => value in map ? map[value] : value;
    resolvedAlign = resolve(alignments, String(align));
    resolvedJustify = resolve(justifications, String(justify));
    classes = [
      "stack",
      wrap ? "stack--wrap" : "",
      className,
      $$sanitized_props.class
    ].filter(Boolean).join(" ");
    styles = [
      style,
      $$sanitized_props.style,
      `--stack-gap:${gap}`,
      `--stack-align:${resolvedAlign}`,
      `--stack-justify:${resolvedJustify}`
    ].filter(Boolean).join(";");
    element(
      $$renderer2,
      as,
      () => {
        $$renderer2.push(`${attributes({ ...$$restProps, class: clsx(classes), style: styles }, "svelte-h657km")}`);
      },
      () => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      }
    );
    bind_props($$props, { as, gap, align, justify, wrap, className, style });
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const cards = [
      {
        mode: "view",
        title: "👁️ View Mode",
        subtitle: "Explore curated map stories",
        description: "Browse featured collections, replay immersive stories, and discover historic overlays alongside modern basemaps.",
        features: [
          "Story gallery",
          "Auto-advance playback",
          "Bookmarks & saved stories"
        ]
      },
      {
        mode: "create",
        title: "✏️ Create Mode",
        subtitle: "Build your own narratives",
        description: "Capture scenes with annotations, manage overlays, and export interactive map stories tailored to your audience.",
        features: [
          "Annotation tools",
          "Scene capture & editing",
          "Export as JSON"
        ]
      }
    ];
    $$renderer2.push(`<main class="mode-selection svelte-1uha8ag">`);
    Container($$renderer2, {
      size: "xl",
      children: ($$renderer3) => {
        Stack($$renderer3, {
          gap: "var(--space-6)",
          align: "center",
          children: ($$renderer4) => {
            $$renderer4.push(`<div class="hero svelte-1uha8ag"><div class="logo svelte-1uha8ag"><span>VMA</span></div> <div class="hero-text svelte-1uha8ag"><h1 class="svelte-1uha8ag">Vietnam Map Archive</h1> <p class="svelte-1uha8ag">Experience and create map-based stories that connect the past with the present.</p></div></div> <div class="card-grid svelte-1uha8ag"><!--[-->`);
            const each_array = ensure_array_like(cards);
            for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
              let card = each_array[$$index_1];
              $$renderer4.push(`<button type="button" class="mode-card svelte-1uha8ag"><div class="card-content svelte-1uha8ag"><div><h2 class="svelte-1uha8ag">${escape_html(card.title)}</h2> <p class="subtitle svelte-1uha8ag">${escape_html(card.subtitle)}</p></div> <p class="description svelte-1uha8ag">${escape_html(card.description)}</p> <ul class="svelte-1uha8ag"><!--[-->`);
              const each_array_1 = ensure_array_like(card.features);
              for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
                let feature = each_array_1[$$index];
                $$renderer4.push(`<li>${escape_html(feature)}</li>`);
              }
              $$renderer4.push(`<!--]--></ul> <span class="cta svelte-1uha8ag">Enter ${escape_html(card.mode === "view" ? "View" : "Create")} Mode</span></div></button>`);
            }
            $$renderer4.push(`<!--]--></div> <div class="links svelte-1uha8ag"><a href="/about" class="link svelte-1uha8ag" aria-disabled="true">About (coming soon)</a> <span class="divider svelte-1uha8ag" aria-hidden="true">•</span> <a href="/signin" class="link svelte-1uha8ag" aria-disabled="true">Sign In (coming soon)</a></div>`);
          },
          $$slots: { default: true }
        });
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></main>`);
  });
}
export {
  _page as default
};
