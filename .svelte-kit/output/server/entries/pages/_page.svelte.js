import "clsx";
import { y as attr_class, x as attr, z as ensure_array_like } from "../../chunks/index.js";
import { a as ssr_context, e as escape_html } from "../../chunks/context.js";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import { fromLonLat } from "ol/proj.js";
import "@allmaps/openlayers";
import "@allmaps/iiif-parser";
import "@allmaps/stdlib";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
function Viewer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let basemapLabel, selectedMapLabel, opacityPercent;
    fromLonLat([106.70098, 10.77653]);
    const BASEMAP_DEFS = [
      {
        key: "esri-imagery",
        label: "ESRI World Imagery",
        layer: () => new TileLayer({
          source: new XYZ({
            url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            maxZoom: 22,
            attributions: "Tiles © Esri"
          }),
          visible: true,
          properties: { name: "esri-imagery", base: true },
          zIndex: 0
        })
      },
      {
        key: "g-streets",
        label: "Google Streets",
        layer: () => new TileLayer({
          source: new XYZ({
            urls: [
              "https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
              "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
              "https://mt2.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
              "https://mt3.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            ],
            attributions: "Tiles © Google",
            maxZoom: 22,
            crossOrigin: "anonymous"
          }),
          visible: false,
          properties: { name: "g-streets", base: true },
          zIndex: 0
        })
      },
      {
        key: "g-satellite",
        label: "Google Satellite",
        layer: () => new TileLayer({
          source: new XYZ({
            urls: [
              "https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
              "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
              "https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
              "https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            ],
            attributions: "Tiles © Google",
            maxZoom: 22,
            crossOrigin: "anonymous"
          }),
          visible: false,
          properties: { name: "g-satellite", base: true },
          zIndex: 0
        })
      },
      {
        key: "hcmc-planning",
        label: "HCMC Planning",
        layer: () => new TileLayer({
          source: new XYZ({
            url: "https://sqhkt-qlqh.tphcm.gov.vn/api/tiles/bandoso/{z}/{x}/{y}",
            attributions: "Tiles © HCMC Department of Planning and Architecture"
          }),
          visible: false,
          properties: { name: "hcmc-planning", base: true },
          zIndex: 0
        })
      }
    ];
    let basemapSelection = "esri-imagery";
    let mapTypeSelection = "all";
    let selectedMapId = "";
    let statusMessage = "Select a map from the list.";
    let mapList = [];
    let filteredMapList = [];
    let panelCollapsed = false;
    let statusError = false;
    let opacity = 0.8;
    let map = null;
    let warpedLayer = null;
    let viewMode = "overlay";
    function applyBasemap(name) {
      if (!map) return;
      map.getLayers().getArray().forEach((layer) => {
        const props = layer.getProperties();
        if (props.base) {
          layer.setVisible(props.name === name);
        }
      });
    }
    function ensureOverlayCanvas() {
      return warpedLayer?.getCanvas() ?? null;
    }
    function updateClipMask() {
      const canvas = ensureOverlayCanvas();
      if (!canvas || !map) return;
      const size = map.getSize();
      if (!size) return;
      const [w, h] = size;
      {
        canvas.style.clipPath = "";
      }
    }
    function updateDividersAndHandles() {
      if (!map) return;
      const size = map.getSize();
      if (!size) return;
      const [w, h] = size;
    }
    function updateLens() {
      if (!map) return;
      const size = map.getSize();
      if (!size) return;
      const [w, h] = size;
    }
    function refreshDecorations() {
      updateClipMask();
      updateDividersAndHandles();
      updateLens();
    }
    function handlePointerDrag(event) {
      if (!map) return;
      return;
    }
    function stopPointerDrag() {
      return;
    }
    onDestroy(() => {
      window.removeEventListener("pointermove", handlePointerDrag);
      window.removeEventListener("pointerup", stopPointerDrag);
      window.removeEventListener("pointercancel", stopPointerDrag);
      map?.setTarget(void 0);
      map = null;
      warpedLayer = null;
    });
    basemapLabel = BASEMAP_DEFS.find((base) => base.key === basemapSelection)?.label ?? "Basemap";
    selectedMapLabel = mapList.find((m) => m.id === selectedMapId)?.name ?? "Select a map";
    opacityPercent = Math.round(opacity * 100);
    filteredMapList = mapList;
    applyBasemap(basemapSelection);
    refreshDecorations();
    $$renderer2.push(`<div class="viewer svelte-1cuq6nk"><div class="map-wrapper svelte-1cuq6nk"><div class="map svelte-1cuq6nk"></div> <div class="divider vertical svelte-1cuq6nk" aria-hidden="true"></div> <div class="divider horizontal svelte-1cuq6nk" aria-hidden="true"></div> <button class="handle vertical svelte-1cuq6nk" type="button" aria-label="Drag vertical split" title="Drag vertical split"></button> <button class="handle horizontal svelte-1cuq6nk" type="button" aria-label="Drag horizontal split" title="Drag horizontal split"></button> <div class="lens svelte-1cuq6nk" aria-hidden="true"></div> <button class="lens-handle svelte-1cuq6nk" type="button" aria-label="Adjust spyglass radius" title="Adjust spyglass radius"></button></div> <div class="control-bar svelte-1cuq6nk"><div${attr_class("control-panel svelte-1cuq6nk", void 0, { "collapsed": panelCollapsed })}><div class="panel-header svelte-1cuq6nk"><div class="panel-summary svelte-1cuq6nk"><span class="panel-title svelte-1cuq6nk">${escape_html(selectedMapLabel)}</span> <span class="panel-sub svelte-1cuq6nk">${escape_html(basemapLabel)} · ${escape_html(opacityPercent)}%</span></div> <button type="button" class="collapse-toggle svelte-1cuq6nk"${attr("aria-expanded", !panelCollapsed)}>${escape_html("Collapse")}</button></div> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="control-row wrap svelte-1cuq6nk"><label class="control-group svelte-1cuq6nk"><span class="control-label svelte-1cuq6nk">Basemap</span> `);
      $$renderer2.select(
        { value: basemapSelection, class: "" },
        ($$renderer3) => {
          $$renderer3.push(`<!--[-->`);
          const each_array = ensure_array_like(BASEMAP_DEFS);
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let basemap = each_array[$$index];
            $$renderer3.option({ value: basemap.key }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(basemap.label)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        },
        "svelte-1cuq6nk"
      );
      $$renderer2.push(`</label> <label class="control-group svelte-1cuq6nk"><span class="control-label svelte-1cuq6nk">Type</span> `);
      $$renderer2.select(
        { value: mapTypeSelection, class: "" },
        ($$renderer3) => {
          $$renderer3.option({ value: "all" }, ($$renderer4) => {
            $$renderer4.push(`All (${escape_html(mapList.length)})`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_1 = ensure_array_like([...new Set(mapList.map((item) => item.type))].sort());
          for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
            let type = each_array_1[$$index_1];
            $$renderer3.option({ value: type }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(type)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        },
        "svelte-1cuq6nk"
      );
      $$renderer2.push(`</label> <label class="control-group grow svelte-1cuq6nk"><span class="control-label svelte-1cuq6nk">Map</span> `);
      $$renderer2.select(
        { value: selectedMapId, class: "" },
        ($$renderer3) => {
          $$renderer3.option({ value: "", disabled: true, selected: true }, ($$renderer4) => {
            $$renderer4.push(`Select…`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_2 = ensure_array_like(filteredMapList);
          for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
            let item = each_array_2[$$index_2];
            $$renderer3.option({ value: item.id }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(item.name)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        },
        "svelte-1cuq6nk"
      );
      $$renderer2.push(`</label></div> <div class="control-row slider-row svelte-1cuq6nk"><div class="control-group slider-group svelte-1cuq6nk"><span class="control-label svelte-1cuq6nk">Opacity</span> <div class="slider svelte-1cuq6nk"><input type="range" min="0" max="1" step="0.05"${attr("value", opacity)} class="svelte-1cuq6nk"/> <span class="svelte-1cuq6nk">${escape_html(opacityPercent)}%</span></div></div></div> <div class="mode-row svelte-1cuq6nk"><div class="mode-buttons svelte-1cuq6nk"><button type="button"${attr_class("svelte-1cuq6nk", void 0, { "selected": viewMode === "overlay" })}>Overlay</button> <button type="button"${attr_class("svelte-1cuq6nk", void 0, { "selected": viewMode === "side-x" })}>Side X</button> <button type="button"${attr_class("svelte-1cuq6nk", void 0, { "selected": viewMode === "side-y" })}>Side Y</button> <button type="button"${attr_class("svelte-1cuq6nk", void 0, { "selected": viewMode === "spy" })}>Spyglass</button></div></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="panel-footer svelte-1cuq6nk"><button type="button" class="btn footer svelte-1cuq6nk"${attr("disabled", true, true)}>Zoom</button> <div class="status-row svelte-1cuq6nk">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <p${attr_class("svelte-1cuq6nk", void 0, { "errored": statusError })}>${escape_html(statusMessage)}</p></div></div></div></div></div>`);
  });
}
function _page($$renderer) {
  Viewer($$renderer);
}
export {
  _page as default
};
