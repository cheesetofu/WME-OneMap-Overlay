// ==UserScript==
// @name         WME OneMap Overlay
// @version      0.2.1
// @description  Overlay the Singapore Land Authority OneMap Default (HD) basemap on the Waze Map Editor.
// @author       Ketchup
// @license      MIT
// @namespace    WME-OneMap-Overlay
// @match        https://www.waze.com/editor*
// @match        https://www.waze.com/*/editor*
// @match        https://beta.waze.com/editor*
// @match        https://beta.waze.com/*/editor*
// @exclude      https://www.waze.com/user/editor*
// @grant        none
// @run-at       document-end
// ==/UserScript==

/*
 *
 * Tiles: https://www.onemap.gov.sg/maps/tiles/Default_HD/{z}/{x}/{y}.png
 * HD tiles are 512px images on the normal 256px grid, so they're drawn into
 * 256px slots — sharp on high-DPI screens, normal label size everywhere.
 *
 * OneMap only covers Singapore at roughly z11–z19. Requests outside that are
 * short-circuited to a blank pixel; past z19 the z19 tiles are upscaled.
 *
 * Map data © OneMap / Singapore Land Authority, Singapore Open Data Licence.
 */

(function () {
  "use strict";

  const SCRIPT_ID = "wme-onemap-overlay";
  const SCRIPT_NAME = "WME OneMap Overlay";
  const SCRIPT_VERSION = "0.2.1";
  const STORAGE_KEY = SCRIPT_ID + ":state";
  const LAYER_NAME = "OneMap (Default HD)";
  const TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Default_HD/${z}/${x}/${y}.png";
  const MIN_Z = 11;
  const MAX_Z = 19;
  const DEFAULT_OPACITY = 0.5;
  const SG_BBOX = { west: 103.55, south: 1.13, east: 104.15, north: 1.5 };
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;

  if (window.top !== window.self) return;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  function loadState() {
    const s = { visible: false, opacity: DEFAULT_OPACITY, color: null, above: false };
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
      if (typeof raw.visible === "boolean") s.visible = raw.visible;
      if (typeof raw.opacity === "number" && raw.opacity >= 0 && raw.opacity <= 1) s.opacity = raw.opacity;
      if (typeof raw.color === "string" && HEX_RE.test(raw.color)) s.color = raw.color;
      if (typeof raw.above === "boolean") s.above = raw.above;
    } catch (e) {
      /* corrupt state — use defaults */
    }
    return s;
  }

  function saveState(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  // Lines-only colour filter
  // OneMap tiles are opaque, so a flat tint would paint a solid block. This
  // knocks out the pale background and recolours what's left (roads, labels).
  // ---------------------------------------------------------------------------

  const SVG_NS = "http://www.w3.org/2000/svg";
  const FILTER_ID = SCRIPT_ID + "-lines";

  function filterFor(color) {
    if (!color || !HEX_RE.test(color)) return "";
    let f = document.getElementById(FILTER_ID);
    if (!f) {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
      const defs = document.createElementNS(SVG_NS, "defs");
      f = document.createElementNS(SVG_NS, "filter");
      f.id = FILTER_ID;
      f.setAttribute("color-interpolation-filters", "sRGB");
      const m = document.createElementNS(SVG_NS, "feColorMatrix");
      m.setAttribute("type", "matrix");
      m.setAttribute("result", "m");
      const ct = document.createElementNS(SVG_NS, "feComponentTransfer");
      ct.setAttribute("in", "m");
      ct.setAttribute("result", "t");
      const fa = document.createElementNS(SVG_NS, "feFuncA");
      fa.setAttribute("type", "linear");
      fa.setAttribute("slope", "2.6");
      fa.setAttribute("intercept", "-0.45");
      ct.appendChild(fa);
      const comp = document.createElementNS(SVG_NS, "feComposite");
      comp.setAttribute("in", "t");
      comp.setAttribute("in2", "SourceGraphic");
      comp.setAttribute("operator", "in");
      f.append(m, ct, comp);
      defs.appendChild(f);
      svg.appendChild(defs);
      document.body.appendChild(svg);
    }
    const n = parseInt(color.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    // RGB -> chosen colour; alpha -> darkness of the original pixel.
    f.querySelector("feColorMatrix").setAttribute(
      "values",
      `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  -0.2126 -0.7152 -0.0722 0 1`
    );
    return "url(#" + FILTER_ID + ")";
  }

  // ---------------------------------------------------------------------------
  // Stacking: above satellite imagery, below roads/places (or above them if
  // "above" is on).
  // ---------------------------------------------------------------------------

  function isImagery(l, base) {
    return !!l && (l === base || l.isBaseLayer === true || l.name === "satellite_imagery" || l.project === "earthengine-legacy");
  }

  function restack(olMap, ours, above) {
    const base = olMap.baseLayer;
    const others = olMap.layers.filter((l) => l !== ours);
    const imagery = others.filter((l) => isImagery(l, base));
    const rest = others.filter((l) => !isImagery(l, base));
    const target = above ? [...imagery, ...rest, ours] : [...imagery, ours, ...rest];
    for (let i = 0; i < target.length; i++) {
      if (olMap.getLayerIndex(target[i]) !== i) olMap.setLayerIndex(target[i], i);
    }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  const CSS_TEXT = `
.om-panel { font-size: 13px; padding: 0 12px 12px; }
.om-panel h4 { margin: 8px 0 12px; font-size: 14px; font-weight: 600; }
.om-row { display: flex; align-items: center; gap: 10px; margin: 10px 0; }
.om-row > span { flex: 1; }
.om-toggle { position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; cursor: pointer; }
.om-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.om-toggle i { position: absolute; inset: 0; background: rgba(120,120,128,.32); border-radius: 22px; transition: background .2s; }
.om-toggle i::before { content: ""; position: absolute; width: 18px; height: 18px; left: 2px; top: 2px; background: #fff; border-radius: 50%; transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.om-toggle input:checked + i { background: #34c759; }
.om-toggle input:checked + i::before { transform: translateX(16px); }
.om-slider { flex: 1; }
.om-value { min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; opacity: .75; }
.om-chips { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.om-chip { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(128,128,128,.35); cursor: pointer; padding: 0; position: relative; background: transparent; }
.om-chip.selected { box-shadow: 0 0 0 2px var(--background_default, #fff), 0 0 0 4px #2d6cdf; }
.om-chip-original::after { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: linear-gradient(135deg, transparent 45%, rgba(128,128,128,.7) 47%, rgba(128,128,128,.7) 53%, transparent 55%); }
.om-color-input { width: 28px; height: 22px; border: 1px solid rgba(128,128,128,.35); border-radius: 4px; padding: 0; background: transparent; cursor: pointer; }
.om-label { font-size: 12px; opacity: .75; margin: 14px 0 6px; }
.om-note { font-size: 11px; opacity: .65; margin-top: 16px; line-height: 1.4; }
.om-note a { color: inherit; }
#om-attrib { position: absolute; left: 8px; bottom: 28px; z-index: 1000; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,.75); color: #333; }
#om-attrib a { color: inherit; }
`;

  function el(tag, props, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k in e) e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const c of children) if (c != null) e.append(c);
    return e;
  }

  function toggleSwitch(checked, onChange) {
    const cb = el("input", { type: "checkbox", checked });
    cb.addEventListener("change", () => onChange(cb.checked));
    return { cb, node: el("label", { class: "om-toggle" }, cb, el("i")) };
  }

  const PRESETS = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7ff", "#ff2d92"];

  // ---------------------------------------------------------------------------
  // Main
  // ---------------------------------------------------------------------------

  async function main() {
    await window.SDK_INITIALIZED;
    const sdk = window.getWmeSdk({ scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });
    const OL = window.OpenLayers || window.OL;
    const olMap = window.W?.map?.getOLMap?.() ?? window.W?.map?.olMap;
    if (!OL || !olMap) {
      console.warn("[" + SCRIPT_ID + "] OpenLayers map unavailable");
      return;
    }

    const style = document.createElement("style");
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);

    const state = loadState();

    // --- Tile layer --------------------------------------------------------
    const RES_Z0 = 156543.033928041;
    const serverResolutions = [];
    for (let z = 0; z <= MAX_Z; z++) serverResolutions.push(RES_Z0 / Math.pow(2, z));

    const R = 6378137;
    const mx = (lon) => (lon * Math.PI * R) / 180;
    const my = (lat) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const sg = { left: mx(SG_BBOX.west), right: mx(SG_BBOX.east), bottom: my(SG_BBOX.south), top: my(SG_BBOX.north) };
    const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    const layer = new OL.Layer.XYZ(LAYER_NAME, TILE_URL, {
      sphericalMercator: true,
      isBaseLayer: false,
      opacity: state.opacity,
      visibility: state.visible,
      serverResolutions,
      // OL2's XYZ constructor defaults numZoomLevels to 19 (z0–18) before it
      // sees serverResolutions, so the layer hid itself from z19 up. Keep it
      // drawn at every map zoom; getURL below skips zooms OneMap can't serve,
      // and serverResolutions makes z20+ upscale the z19 tiles.
      alwaysInRange: true,
      numZoomLevels: 24,
      transitionEffect: "resize",
      displayInLayerSwitcher: false,
    });
    const baseGetURL = layer.getURL;
    layer.getURL = function (b) {
      if (b.right < sg.left || b.left > sg.right || b.top < sg.bottom || b.bottom > sg.top) return BLANK;
      if (typeof this.getXYZ === "function" && this.getXYZ(b).z < MIN_Z) return BLANK;
      return baseGetURL.call(this, b);
    };
    olMap.addLayer(layer);
    if (layer.div) layer.div.style.filter = filterFor(state.color);

    // --- Stacking ----------------------------------------------------------
    let busy = false;
    let pending = false;
    const doRestack = () => {
      if (busy) return;
      busy = true;
      try {
        restack(olMap, layer, state.above);
      } finally {
        busy = false;
      }
    };
    const scheduleRestack = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        doRestack();
      }, 50);
    };
    doRestack();
    for (const ev of ["addlayer", "removelayer", "changelayer", "changebaselayer"]) {
      try {
        olMap.events.register(ev, null, scheduleRestack);
      } catch (e) {
        /* ignore */
      }
    }
    const timer = setInterval(scheduleRestack, 2000);
    window.addEventListener("pagehide", () => clearInterval(timer));

    // --- Attribution badge -------------------------------------------------
    const attrib = el("div", {
      id: "om-attrib",
      html: 'Map data © <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> · Singapore Land Authority',
    });
    const updateAttrib = () => {
      if (state.visible && !attrib.isConnected) (olMap.div || document.body).append(attrib);
      if (!state.visible && attrib.isConnected) attrib.remove();
    };
    updateAttrib();

    // --- Visibility (shared by sidebar + WME Layers menu) -------------------
    let sidebarToggle = null;
    let switcherOk = false;
    const setVisible = (v) => {
      if (state.visible === v) return;
      state.visible = v;
      layer.setVisibility(v);
      saveState(state);
      updateAttrib();
      if (sidebarToggle) sidebarToggle.checked = v;
      if (switcherOk) {
        try {
          sdk.LayerSwitcher.setLayerCheckboxChecked({ name: LAYER_NAME, isChecked: v });
        } catch (e) {
          /* ignore */
        }
      }
    };

    try {
      sdk.LayerSwitcher.addLayerCheckbox({ name: LAYER_NAME, isChecked: state.visible });
      switcherOk = true;
    } catch (e) {
      console.warn("[" + SCRIPT_ID + "] addLayerCheckbox failed", e);
    }
    sdk.Events.on({
      eventName: "wme-layer-checkbox-toggled",
      eventHandler: ({ name, checked }) => name === LAYER_NAME && setVisible(checked),
    });

    // --- Sidebar tab -------------------------------------------------------
    const { tabLabel, tabPane } = await sdk.Sidebar.registerScriptTab();
    tabLabel.textContent = "OneMap";
    tabLabel.title = SCRIPT_NAME;
    tabPane.classList.add("om-panel");
    tabPane.append(el("h4", null, "OneMap Overlay v" + SCRIPT_VERSION));

    const vis = toggleSwitch(state.visible, setVisible);
    sidebarToggle = vis.cb;
    tabPane.append(el("div", { class: "om-row" }, vis.node, el("span", null, "Show OneMap")));

    const slider = el("input", { type: "range", min: 0, max: 100, step: 1, class: "om-slider", value: Math.round(state.opacity * 100) });
    const val = el("span", { class: "om-value" }, slider.value + "%");
    slider.addEventListener("input", () => {
      val.textContent = slider.value + "%";
      state.opacity = Number(slider.value) / 100;
      layer.setOpacity(state.opacity);
      saveState(state);
    });
    tabPane.append(el("div", { class: "om-row" }, el("span", { style: "flex:0" }, "Opacity"), slider, val));

    const above = toggleSwitch(state.above, (v) => {
      state.above = v;
      saveState(state);
      doRestack();
    });
    tabPane.append(el("div", { class: "om-row" }, above.node, el("span", null, "Draw above roads & places")));

    // Lines-only colour
    tabPane.append(el("div", { class: "om-label" }, "Lines only (hide background, recolour roads & labels)"));
    const chips = el("div", { class: "om-chips" });
    const allChips = [];
    const colorInput = el("input", { type: "color", class: "om-color-input", title: "Custom", value: state.color || "#ff3b30" });
    const setColor = (c) => {
      state.color = c;
      if (layer.div) layer.div.style.filter = filterFor(c);
      saveState(state);
      allChips.forEach((ch) => ch.classList.toggle("selected", (ch.dataset.color || null) === (c || null)));
      if (c) colorInput.value = c;
    };
    const orig = el("button", { type: "button", class: "om-chip om-chip-original", title: "Original map colours" });
    orig.dataset.color = "";
    allChips.push(orig);
    for (const hex of PRESETS) {
      const c = el("button", { type: "button", class: "om-chip", title: hex });
      c.style.backgroundColor = hex;
      c.dataset.color = hex;
      allChips.push(c);
    }
    allChips.forEach((ch) => {
      ch.addEventListener("click", () => setColor(ch.dataset.color || null));
      chips.append(ch);
    });
    colorInput.addEventListener("input", () => setColor(colorInput.value.toLowerCase()));
    chips.append(colorInput);
    tabPane.append(chips);
    setColor(state.color);

    tabPane.append(
      el("div", {
        class: "om-note",
        html:
          "Covers Singapore only, zoom 11–19.<br>" +
          'Map data © <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a>, ' +
          '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>, ' +
          'under the <a href="https://www.onemap.gov.sg/legal/opendatalicence.html" target="_blank" rel="noopener">Singapore Open Data Licence</a>.',
      })
    );

    console.log("[" + SCRIPT_ID + "] ready");
  }

  (function waitForSdk(tries) {
    if (window.SDK_INITIALIZED) return main().catch((e) => console.error("[" + SCRIPT_ID + "]", e));
    if (tries > 200) return console.warn("[" + SCRIPT_ID + "] gave up waiting for WME SDK");
    setTimeout(() => waitForSdk(tries + 1), 100);
  })(0);
})();
