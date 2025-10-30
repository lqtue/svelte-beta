import { a as attr, b as attr_class, e as ensure_array_like, c as bind_props } from "./index2.js";
import { _ as ssr_context, Y as fallback, X as escape_html } from "./context.js";
import { fromLonLat } from "ol/proj.js";
import GeoJSON from "ol/format/GeoJSON.js";
import { unByKey } from "ol/Observable.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import "@allmaps/openlayers";
import "@allmaps/iiif-parser";
import "@allmaps/stdlib";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import Style from "ol/style/Style.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import CircleStyle from "ol/style/Circle.js";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
const DEFAULT_ANNOTATION_COLOR = "#2563eb";
fromLonLat([106.70098, 10.77653]);
const BASEMAP_DEFS = [
  {
    key: "g-streets",
    label: "Google Maps",
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
      visible: true,
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
  }
];
function SearchOverlay($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const noop = () => {
    };
    let panelCollapsed = fallback($$props["panelCollapsed"], false);
    let searchQuery = fallback($$props["searchQuery"], "");
    let searchResults = fallback($$props["searchResults"], () => [], true);
    let searchLoading = fallback($$props["searchLoading"], false);
    let searchNotice = fallback($$props["searchNotice"], null);
    let searchNoticeType = fallback($$props["searchNoticeType"], "info");
    let appMode = fallback($$props["appMode"], "explore");
    let queueSearch = fallback($$props["queueSearch"], noop);
    let locateUser = fallback($$props["locateUser"], noop);
    let clearSearch = fallback($$props["clearSearch"], noop);
    let zoomToSearchResult = fallback($$props["zoomToSearchResult"], noop);
    let addSearchResultToAnnotations = fallback($$props["addSearchResultToAnnotations"], noop);
    let presenting = fallback($$props["presenting"], false);
    if (!panelCollapsed && !presenting) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="search-overlay svelte-bzaubf"><div class="search-box svelte-bzaubf"><div class="search-row svelte-bzaubf"><div class="input-wrapper svelte-bzaubf"><span class="input-icon svelte-bzaubf" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor" class="svelte-bzaubf"><path fill-rule="evenodd" d="M8.5 3.5a5 5 0 013.95 8.08l3.23 3.23a.75.75 0 11-1.06 1.06l-3.23-3.23A5 5 0 118.5 3.5zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" clip-rule="evenodd"></path></svg></span> <input type="text" placeholder="Search for a place or address…"${attr("value", searchQuery)} aria-label="Search for a place or address" class="svelte-bzaubf"/></div> <button type="button" class="chip ghost svelte-bzaubf"${attr("disabled", searchLoading, true)}><span class="chip-icon" aria-hidden="true">📍</span> Locate</button> <button type="button" class="chip ghost svelte-bzaubf"${attr("disabled", !searchQuery && !searchResults.length, true)}><span class="chip-icon" aria-hidden="true">✕</span> Clear</button></div> <div class="search-status svelte-bzaubf">`);
      if (searchLoading) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span>Searching…</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
        if (searchNotice) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span${attr_class("svelte-bzaubf", void 0, {
            "errored": searchNoticeType === "error",
            "success": searchNoticeType === "success"
          })}>${escape_html(searchNotice)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div> `);
      if (searchResults.length) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="search-results svelte-bzaubf"><!--[-->`);
        const each_array = ensure_array_like(searchResults);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let result = each_array[$$index];
          $$renderer2.push(`<div class="search-result svelte-bzaubf"><button type="button" class="result-main svelte-bzaubf"><span class="result-title svelte-bzaubf">${escape_html(result.display_name)}</span> `);
          if (result.type) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="result-type svelte-bzaubf">${escape_html(result.type)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></button> `);
          if (appMode === "create") {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<button type="button" class="chip add"><span class="chip-icon" aria-hidden="true">＋</span> Add</button>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, {
      panelCollapsed,
      searchQuery,
      searchResults,
      searchLoading,
      searchNotice,
      searchNoticeType,
      appMode,
      queueSearch,
      locateUser,
      clearSearch,
      zoomToSearchResult,
      addSearchResultToAnnotations,
      presenting
    });
  });
}
function BasemapButtons($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let basemaps = fallback($$props["basemaps"], () => [], true);
    let selected = fallback($$props["selected"], "");
    let label = fallback($$props["label"], "Basemap selection");
    $$renderer2.push(`<div class="basemap-buttons svelte-8cdsst" role="group"${attr("aria-label", label)}><!--[-->`);
    const each_array = ensure_array_like(basemaps);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let basemap = each_array[$$index];
      $$renderer2.push(`<button type="button"${attr("aria-pressed", selected === basemap.key)}${attr_class("svelte-8cdsst", void 0, { "selected": selected === basemap.key })}>${escape_html(basemap.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { basemaps, selected, label });
  });
}
function randomId(prefix = "anno") {
  const random = Math.random().toString(36).slice(2, 8);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
function ensureAnnotationDefaults(feature) {
  let id = feature.getId();
  if (!id) {
    id = randomId();
    feature.setId(id);
  }
  if (!feature.get("label")) {
    feature.set("label", "Untitled");
  }
  if (!feature.get("color")) {
    feature.set("color", DEFAULT_ANNOTATION_COLOR);
  }
  if (typeof feature.get("hidden") !== "boolean") {
    feature.set("hidden", false);
  }
}
function toAnnotationSummary(feature) {
  ensureAnnotationDefaults(feature);
  return {
    id: feature.getId(),
    label: feature.get("label") ?? "Untitled",
    type: feature.getGeometry()?.getType() ?? "Geometry",
    color: feature.get("color") ?? DEFAULT_ANNOTATION_COLOR,
    details: feature.get("details") ?? "",
    hidden: Boolean(feature.get("hidden"))
  };
}
new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "#06b6d4" }),
    stroke: new Stroke({ color: "#0e7490", width: 2 })
  }),
  stroke: new Stroke({ color: "#06b6d4", width: 2 }),
  fill: new Fill({ color: "rgba(6, 182, 212, 0.18)" })
});
function MapViewport($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let visibleStoryScenes, currentStoryScene, basemapLabel, selectedMapLabel, opacityPercent, modeLabel;
    const geoJsonFormat = new GeoJSON();
    let initialMode = fallback($$props["initialMode"], "explore");
    let showWelcomeOverlay = fallback($$props["showWelcomeOverlay"], true);
    let layout = fallback($$props["layout"], "desktop");
    let basemapSelection = "g-streets";
    let mapTypeSelection = "all";
    let selectedMapId = "";
    let statusMessage = "Select a map from the list.";
    let mapList = [];
    let filteredMapList = [];
    let panelCollapsed = false;
    let statusError = false;
    let opacity = 0.8;
    let showWelcome = showWelcomeOverlay;
    let appMode = initialMode;
    let modeMenuOpen = false;
    let selectedAnnotationId = null;
    let searchQuery = "";
    let searchResults = [];
    let searchLoading = false;
    let searchNotice = null;
    let searchNoticeType = "info";
    let searchDebounce = null;
    let searchAbortController = null;
    let storyScenes = [];
    let storyPresenting = false;
    let storyActiveSceneIndex = 0;
    let createPanelTab = "map";
    let map = null;
    let warpedLayer = null;
    let annotationSource = null;
    let searchSource = null;
    let drawInteraction = null;
    let modifyInteraction = null;
    let selectInteraction = null;
    let annotationListenerKeys = [];
    let viewMode = "overlay";
    function updateAnnotationSummaries() {
      const list = annotationSource ? annotationSource.getFeatures().map((feature) => toAnnotationSummary(feature)) : [];
      if (selectedAnnotationId && !list.some((item) => item.id === selectedAnnotationId)) {
        selectedAnnotationId = null;
      }
    }
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
    function removeDrawInteraction() {
      if (!map || !drawInteraction) return;
      map.removeInteraction(drawInteraction);
      drawInteraction = null;
    }
    function clearSearchResults() {
      searchResults = [];
      searchNotice = null;
      searchNoticeType = "info";
      searchLoading = false;
    }
    function featureFromSearchResult(result) {
      try {
        if (result.geojson) {
          const feature = geoJsonFormat.readFeature({ type: "Feature", geometry: result.geojson, properties: {} }, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
          feature.set("label", result.display_name ?? result.type ?? "Search result");
          return feature;
        }
        if (result.lon && result.lat) {
          const point = new Point(fromLonLat([Number(result.lon), Number(result.lat)]));
          const feature = new Feature({ geometry: point });
          feature.set("label", result.display_name ?? result.type ?? "Search result");
          return feature;
        }
      } catch (error) {
        console.warn("Unable to create feature from search result", error);
      }
      return null;
    }
    async function runSearch(query) {
      const trimmed = query.trim();
      searchQuery = query;
      if (!trimmed) {
        clearSearchResults();
        searchSource?.clear();
        searchAbortController?.abort();
        searchAbortController = null;
        return;
      }
      searchAbortController?.abort();
      searchAbortController = new AbortController();
      searchLoading = true;
      searchNotice = null;
      searchNoticeType = "info";
      try {
        const params = new URLSearchParams({
          format: "jsonv2",
          q: trimmed,
          addressdetails: "1",
          polygon_geojson: "1",
          limit: "10"
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          signal: searchAbortController.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        searchResults = data;
        if (!data.length) {
          searchNotice = "No results found.";
          searchNoticeType = "info";
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        searchNotice = "Search failed. Please try again.";
        searchNoticeType = "error";
        console.error("Search error:", error);
        searchResults = [];
      } finally {
        searchLoading = false;
      }
    }
    function queueSearch(query) {
      searchQuery = query;
      if (searchDebounce) clearTimeout(searchDebounce);
      const delay = 1e3;
      searchDebounce = window.setTimeout(
        () => {
          runSearch(query);
        },
        delay
      );
    }
    function zoomToSearchResult(result) {
      if (!map || !searchSource) return;
      const feature = featureFromSearchResult(result);
      if (!feature) return;
      searchSource.clear();
      searchSource.addFeature(feature);
      const geometry = feature.getGeometry();
      if (!geometry) return;
      if (geometry.getType() === "Point") {
        const coords = geometry.getCoordinates();
        map.getView().animate({
          center: coords,
          zoom: Math.max(map.getView().getZoom() ?? 12, 16),
          duration: 400
        });
      } else {
        map.getView().fit(geometry.getExtent(), { padding: [80, 80, 80, 80], duration: 400, maxZoom: 18 });
      }
    }
    function addSearchResultToAnnotations(result) {
      if (!annotationSource) return;
      const feature = featureFromSearchResult(result);
      if (!feature) return;
      ensureAnnotationDefaults(feature);
      annotationSource.addFeature(feature);
      selectedAnnotationId = feature.getId();
      updateAnnotationSummaries();
      clearSearchResults();
      searchNotice = "Feature added to annotations.";
      searchNoticeType = "success";
      searchSource?.clear();
      searchQuery = "";
    }
    function clearSearch() {
      searchQuery = "";
      clearSearchResults();
      searchSource?.clear();
      searchAbortController?.abort();
      searchAbortController = null;
      searchNotice = null;
      searchNoticeType = "info";
    }
    function locateUser() {
      const currentMap = map;
      const currentSearchSource = searchSource;
      if (!currentMap || !currentSearchSource) return;
      if (!("geolocation" in navigator)) {
        searchNotice = "Geolocation is not available.";
        searchNoticeType = "error";
        return;
      }
      searchLoading = true;
      searchNotice = null;
      searchNoticeType = "info";
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const coords = fromLonLat([longitude, latitude]);
          currentSearchSource.clear();
          const feature = new Feature({ geometry: new Point(coords) });
          feature.set("label", "Current location");
          currentSearchSource.addFeature(feature);
          const view = currentMap.getView();
          view.animate({
            center: coords,
            zoom: Math.max(view.getZoom() ?? 12, 16),
            duration: 450
          });
          searchLoading = false;
          searchNotice = "Centered on your location.";
          searchNoticeType = "success";
        },
        (error) => {
          searchLoading = false;
          searchNotice = `Could not get location: ${error.message}`;
          searchNoticeType = "error";
        }
      );
    }
    onDestroy(() => {
      searchAbortController?.abort();
      window.removeEventListener("pointermove", handlePointerDrag);
      window.removeEventListener("pointerup", stopPointerDrag);
      window.removeEventListener("pointercancel", stopPointerDrag);
      annotationListenerKeys.forEach((key) => unByKey(key));
      annotationListenerKeys = [];
      removeDrawInteraction();
      if (map && modifyInteraction) {
        map.removeInteraction(modifyInteraction);
      }
      if (map && selectInteraction) {
        map.removeInteraction(selectInteraction);
      }
      map?.setTarget(void 0);
      map = null;
      warpedLayer = null;
      annotationSource = null;
      searchSource = null;
      modifyInteraction = null;
      selectInteraction = null;
    });
    visibleStoryScenes = storyScenes.filter((scene) => !scene.hidden);
    currentStoryScene = storyScenes[storyActiveSceneIndex] ?? null;
    currentStoryScene ? visibleStoryScenes.findIndex((scene) => scene.id === currentStoryScene.id) + 1 : 0;
    basemapLabel = BASEMAP_DEFS.find((base) => base.key === basemapSelection)?.label ?? "Basemap";
    selectedMapLabel = mapList.find((m) => m.id === selectedMapId)?.name ?? "Select a map";
    opacityPercent = Math.round(opacity * 100);
    modeLabel = appMode === "explore" ? "Exploring" : "Creating";
    filteredMapList = mapList;
    applyBasemap(basemapSelection);
    refreshDecorations();
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div${attr_class("viewer svelte-1gd50sk", void 0, {
        "layout-mobile": layout === "mobile",
        "layout-tablet": layout === "tablet",
        "layout-desktop": layout === "desktop"
      })}>`);
      if (showWelcome) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<div class="welcome-overlay svelte-1gd50sk"><div class="welcome-card svelte-1gd50sk"><h1 class="svelte-1gd50sk">Welcome to the viewer</h1> <p class="svelte-1gd50sk">This experience lets you explore historic maps alongside the modern web. Pick how you want to get started.</p> <div class="welcome-actions svelte-1gd50sk"><button type="button"${attr_class("svelte-1gd50sk", void 0, { "selected": appMode === "explore" })}>Exploring</button> <button type="button"${attr_class("svelte-1gd50sk", void 0, { "selected": appMode === "create" })}>Creating</button></div></div></div>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> <div class="map-wrapper svelte-1gd50sk"><div class="map svelte-1gd50sk"></div> <div class="divider vertical svelte-1gd50sk" aria-hidden="true"></div> <div class="divider horizontal svelte-1gd50sk" aria-hidden="true"></div> <button class="handle vertical svelte-1gd50sk" type="button" aria-label="Drag vertical split" title="Drag vertical split"></button> <button class="handle horizontal svelte-1gd50sk" type="button" aria-label="Drag horizontal split" title="Drag horizontal split"></button> <div class="lens svelte-1gd50sk" aria-hidden="true"></div> <button class="lens-handle svelte-1gd50sk" type="button" aria-label="Adjust spyglass radius" title="Adjust spyglass radius"></button></div> `);
      SearchOverlay($$renderer3, {
        panelCollapsed,
        searchResults,
        searchLoading,
        searchNotice,
        searchNoticeType,
        appMode,
        queueSearch,
        locateUser,
        clearSearch,
        zoomToSearchResult,
        addSearchResultToAnnotations,
        presenting: storyPresenting,
        get searchQuery() {
          return searchQuery;
        },
        set searchQuery($$value) {
          searchQuery = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> `);
      {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> <div${attr_class("control-bar svelte-1gd50sk", void 0, { "presenting": storyPresenting })}><div${attr_class("control-panel svelte-1gd50sk", void 0, {
        "collapsed": panelCollapsed,
        "disabled": searchLoading || storyPresenting
      })}><div class="panel-header svelte-1gd50sk"><div class="panel-summary svelte-1gd50sk"><span class="panel-title svelte-1gd50sk">${escape_html(selectedMapLabel)}</span> <span class="panel-sub svelte-1gd50sk">${escape_html(basemapLabel)} · ${escape_html(opacityPercent)}% · ${escape_html(modeLabel)}</span></div> <div class="panel-actions svelte-1gd50sk"><div class="mode-control svelte-1gd50sk"><button type="button" class="settings-button svelte-1gd50sk" aria-haspopup="true"${attr("aria-expanded", modeMenuOpen)}>Settings</button> `);
      {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--></div> <button type="button" class="collapse-toggle svelte-1gd50sk"${attr("aria-expanded", !panelCollapsed)}>${escape_html("Collapse")}</button></div></div> `);
      {
        $$renderer3.push("<!--[!-->");
        $$renderer3.push(`<div class="panel-content svelte-1gd50sk">`);
        if (appMode === "create") {
          $$renderer3.push("<!--[-->");
          $$renderer3.push(`<div class="create-tabs svelte-1gd50sk" role="tablist" aria-label="Create mode sections"><button type="button" role="tab"${attr("aria-selected", createPanelTab === "map")}${attr_class("svelte-1gd50sk", void 0, { "selected": createPanelTab === "map" })}>Map</button> <button type="button" role="tab"${attr("aria-selected", createPanelTab === "annotations")}${attr_class("svelte-1gd50sk", void 0, { "selected": createPanelTab === "annotations" })}>Annotations</button> <button type="button" role="tab"${attr("aria-selected", createPanelTab === "story")}${attr_class("svelte-1gd50sk", void 0, { "selected": createPanelTab === "story" })}>Storytelling</button></div>`);
        } else {
          $$renderer3.push("<!--[!-->");
        }
        $$renderer3.push(`<!--]--> `);
        {
          $$renderer3.push("<!--[-->");
          $$renderer3.push(`<section class="control-section svelte-1gd50sk"><p class="section-title svelte-1gd50sk">Base map</p> <div class="section-body svelte-1gd50sk"><div class="control-group svelte-1gd50sk">`);
          BasemapButtons($$renderer3, { basemaps: BASEMAP_DEFS, selected: basemapSelection });
          $$renderer3.push(`<!----></div></div></section> <section class="control-section svelte-1gd50sk"><p class="section-title svelte-1gd50sk">Overlay map</p> <div class="section-body overlay-grid svelte-1gd50sk"><label class="control-group svelte-1gd50sk"><span class="control-label svelte-1gd50sk">Type</span> `);
          $$renderer3.select(
            { value: mapTypeSelection, class: "" },
            ($$renderer4) => {
              $$renderer4.option({ value: "all" }, ($$renderer5) => {
                $$renderer5.push(`All (${escape_html(mapList.length)})`);
              });
              $$renderer4.push(`<!--[-->`);
              const each_array = ensure_array_like([...new Set(mapList.map((item) => item.type))].sort());
              for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
                let type = each_array[$$index];
                $$renderer4.option({ value: type }, ($$renderer5) => {
                  $$renderer5.push(`${escape_html(type)}`);
                });
              }
              $$renderer4.push(`<!--]-->`);
            },
            "svelte-1gd50sk"
          );
          $$renderer3.push(`</label> <label class="control-group grow svelte-1gd50sk"><span class="control-label svelte-1gd50sk">Map</span> `);
          $$renderer3.select(
            { value: selectedMapId, class: "" },
            ($$renderer4) => {
              $$renderer4.option({ value: "", disabled: true, selected: true }, ($$renderer5) => {
                $$renderer5.push(`Select…`);
              });
              $$renderer4.push(`<!--[-->`);
              const each_array_1 = ensure_array_like(filteredMapList);
              for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
                let item = each_array_1[$$index_1];
                $$renderer4.option({ value: item.id }, ($$renderer5) => {
                  $$renderer5.push(`${escape_html(item.name)}`);
                });
              }
              $$renderer4.push(`<!--]-->`);
            },
            "svelte-1gd50sk"
          );
          $$renderer3.push(`</label></div></section> <section class="control-section svelte-1gd50sk"><p class="section-title svelte-1gd50sk">View Mode &amp; Opacity</p> <div class="view-grid svelte-1gd50sk"><div class="slider-group svelte-1gd50sk"><span class="control-label svelte-1gd50sk">Opacity</span> <div class="slider svelte-1gd50sk"><input type="range" min="0" max="1" step="0.05"${attr("value", opacity)} class="svelte-1gd50sk"/> <span class="svelte-1gd50sk">${escape_html(opacityPercent)}%</span></div></div> <div class="mode-buttons svelte-1gd50sk"><button type="button"${attr_class("svelte-1gd50sk", void 0, { "selected": viewMode === "overlay" })}>Overlay</button> <button type="button"${attr_class("svelte-1gd50sk", void 0, { "selected": viewMode === "side-x" })}>Side X</button> <button type="button"${attr_class("svelte-1gd50sk", void 0, { "selected": viewMode === "side-y" })}>Side Y</button> <button type="button"${attr_class("svelte-1gd50sk", void 0, { "selected": viewMode === "spy" })}>Spyglass</button></div></div></section>`);
        }
        $$renderer3.push(`<!--]--> `);
        {
          $$renderer3.push("<!--[!-->");
        }
        $$renderer3.push(`<!--]--> `);
        {
          $$renderer3.push("<!--[!-->");
        }
        $$renderer3.push(`<!--]--> <div class="panel-footer svelte-1gd50sk"><div class="footer-actions svelte-1gd50sk"><button type="button" class="btn footer svelte-1gd50sk"${attr("disabled", true, true)}>Zoom</button> <button type="button" class="btn footer ghost svelte-1gd50sk">Clear cache</button></div> <div class="status-row svelte-1gd50sk">`);
        {
          $$renderer3.push("<!--[!-->");
        }
        $$renderer3.push(`<!--]--> <p${attr_class("svelte-1gd50sk", void 0, { "errored": statusError })}>${escape_html(statusMessage)}</p></div></div></div>`);
      }
      $$renderer3.push(`<!--]--></div></div></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    bind_props($$props, { initialMode, showWelcomeOverlay, layout });
  });
}
export {
  MapViewport as M
};
