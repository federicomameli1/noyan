// Map view: draws the hand-drawn map in SVG and handles zoom, panning and selection.
// It reads data from the simulation (src/sim) and never changes it.
import { Delaunay } from "d3-delaunay";
import { CITIES, REGIONS, ROADS, project, type CityType, type Graph, type Point, type Region, type Site } from "../sim";
import { GEO, type Pass } from "./geo";

export type Layer = "map" | "terrain" | "pasture" | "political" | "diplomatic";

export const LABELS = {
  terrain: { steppe: "Steppe", desert: "Desert", upland: "Uplands and hills", mountain: "Mountains", plain: "Farmed plain" },
  political: { mongols: "Mongol control", jin: "Jin control", contested: "Contested", xixia: "Xi Xia, Mongol vassal" },
  diplomatic: { ally: "Allied or submitted", neutral: "Wavering", hostile: "Hostile" },
} as const;

/** Main mountain ranges: name and a line along the crest, west or south end first, as (lon, lat). Approximate. */
const RANGES: [string, [number, number][]][] = [
  ["Taihang Shan", [[113.25, 35.75], [113.65, 36.7], [113.85, 37.45]]],
  ["Lüliang Shan", [[110.95, 36.75], [111.25, 37.6], [111.5, 38.35]]],
  ["Yan Shan", [[117.45, 40.5], [118.3, 40.38], [119.1, 40.25]]],
  ["Wutai Shan", [[113.4, 38.75], [114.05, 39.0]]],
  ["Yin Shan", [[108.7, 41.15], [110.1, 41.35], [111.4, 41.3]]],
];

export interface MapOptions {
  container: HTMLElement;
  tooltip: HTMLElement;
  onSelectRegion?: (r: Region) => void;
  onSelectPass?: (p: Pass) => void;
  /** movement graph of the scenario, drawn over the map */
  graph?: Graph;
  onSelectSite?: (s: Site) => void;
  /** pointer entering (site) or leaving (null) a site */
  onHoverSite?: (s: Site | null) => void;
  /** a column's helmet was clicked or tapped, by its index */
  onSelectColumn?: (i: number) => void;
  /** Jin strongholds that can be besieged, by site id */
  targets?: Record<string, CityType>;
}

export interface ColumnMark {
  name: string;
  lon: number;
  lat: number;
  /** horses' condition, 0-100, shown as a small bar coloured by level */
  condition: number;
  level: "ok" | "warn" | "bad";
  active: boolean;
}

export interface GameMap {
  setLayer(l: Layer): void;
  zoom(factor: number): void;
  resetView(): void;
  /** draws the army's columns as helmets with their name and horse condition; the active one is in front */
  setColumns(cols: readonly ColumnMark[]): void;
  /** draws the planned route, as (lon, lat) points; empty to clear it */
  setRoute(points: readonly (readonly [number, number])[]): void;
  /** draws a possible route, fainter than the planned one; empty to clear it */
  setPreview(points: readonly (readonly [number, number])[]): void;
  /** highlights a site of the graph, or none */
  selectSite(id: string | null): void;
  /** zooms onto a (lon, lat) box */
  focus(lon0: number, lat0: number, lon1: number, lat1: number): void;
  /** strongholds already taken: drawn in Mongol colours */
  setTaken(ids: readonly string[]): void;
}

const NS = "http://www.w3.org/2000/svg";
type Attrs = Record<string, string | number>;
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent?.appendChild(e);
  return e;
}
export const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hex = (s: string) => parseInt(s.replace("#", ""), 16);
export function mix(a: string, b: string, k: number) {
  const A = hex(a), B = hex(b), ch = (s: number) => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k);
  return "#" + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0");
}

export function regionFill(r: Region, layer: Layer): string | null {
  switch (layer) {
    case "terrain": return cssVar("--t-" + r.terrain);
    case "pasture": return mix(cssVar("--p-low"), cssVar("--p-high"), r.pasture / 100);
    case "political": return cssVar("--pol-" + r.control);
    case "diplomatic": return cssVar("--dip-" + r.diplomacy);
    default: return null;
  }
}

/** How far above a place a column standing there is drawn: clears the place's symbol and its clickable area. */
const COLUMN_LIFT = 30;

/** Mongol helmet used as the column marker, on the map and in the legend. */
export function helmet(): string {
  const ink = cssVar("--ink"), paper = cssVar("--paper"), label = cssVar("--label");
  return `
  <path d="M0,-25.5C5,-27 9.5,-23.5 11,-17.5C8,-20.5 4.5,-22.5 0.5,-22.5Z" fill="${label}" stroke="${ink}" stroke-width=".6"/>
  <path d="M-9,-4.5L-13,6.5Q0,10 13,6.5L9,-4.5Z" fill="${cssVar("--pol-mongols")}" stroke="${ink}" stroke-width=".9"/>
  <path d="M-10.3,-1Q0,1.5 10.3,-1M-11.6,2.8Q0,5.6 11.6,2.8" fill="none" stroke="${paper}" stroke-width=".7" stroke-opacity=".75"/>
  <path d="M-7,-5.5V8M-3.5,-5.5V8.8M0,-5.5V9M3.5,-5.5V8.8M7,-5.5V8" stroke="${ink}" stroke-width=".45" stroke-opacity=".6"/>
  <path d="M-8,-6C-8,-14 -3,-19.5 0,-23.5C3,-19.5 8,-14 8,-6Z" fill="#a8a294" stroke="${ink}" stroke-width="1"/>
  <path d="M-2.2,-19Q-5.5,-14 -5.8,-8" fill="none" stroke="${paper}" stroke-width="1.2" stroke-opacity=".75"/>
  <path d="M0,-23.5V-27.5" stroke="${ink}" stroke-width="1.3"/>
  <circle cx="0" cy="-27.8" r="1.3" fill="${ink}"/>
  <rect x="-9.5" y="-7.2" width="19" height="3" rx="1.2" fill="${label}" stroke="${ink}" stroke-width=".8"/>`;
}

/** Wall outline with merlons on top, centred on (0, 0). */
function battlement(w: number, h: number, n: number, dy = 0) {
  const x0 = -w / 2, top = -h / 2 + dy, mw = w / (2 * n - 1), notch = mw * 0.8;
  let d = `M${x0},${h / 2 + dy}V${top}`;
  for (let i = 0; i < 2 * n - 1; i++) {
    d += `H${(x0 + (i + 1) * mw).toFixed(2)}`;
    if (i < 2 * n - 2) d += `V${(i % 2 === 0 ? top + notch : top).toFixed(2)}`;
  }
  return d + `V${h / 2 + dy}Z`;
}

/** Symbol of a Jin stronghold, centred on (0, 0). Colours come from CSS, so a taken one turns blue. */
export function targetSymbol(type: CityType): string {
  switch (type) {
    case "town":
      return `<path class="tg" d="${battlement(10, 8, 2)}"/>`;
    case "walled":
      return `<path class="tg" d="${battlement(15, 11, 3)}"/><path class="tg-fill" d="M-2.2,5.5V2.4a2.2,2.2 0 0 1 4.4,0V5.5Z"/>`;
    case "fortress":
      return `<path class="tg" d="M-9,8.5L-5,4.5L5,4.5L9,8.5Z"/><path class="tg" d="${battlement(9, 13, 2, -2)}"/>`
        + `<path class="tg-fill" d="M-.6,-8.5V-15L5,-13.2L-.6,-11.4Z"/><path class="tg-fill" d="M-1.5,4.5V0.5a1.5,1.5 0 0 1 3,0V4.5Z"/>`;
  }
}

export const TARGET_TEXT: Record<CityType, string> = {
  town: "Jin town, can be besieged",
  walled: "Jin walled city, can be besieged",
  fortress: "Jin fortress, closes the pass",
};

export function createMap(opts: MapOptions): GameMap {
  const { W, H } = GEO;
  const { container: stage, tooltip: tip } = opts;
  const centers = REGIONS.map(r => [...project(r.lon, r.lat)] as [number, number]);
  let layer: Layer = "pasture";
  let selected: Region | null = null;

  // seeded pseudo-random generator, so the drawing is always the same
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const j = (a: number) => (rnd() - 0.5) * a;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Hand-drawn map of northern China in 1218" });
  stage.prepend(svg);
  const C = cssVar;
  const land = GEO.land.join("");
  svg.innerHTML = `<defs>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 .35  0 0 0 0 .27  0 0 0 0 .15  0 0 0 .55 -.18"/>
  </filter>
  <filter id="blotch" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".006" numOctaves="3" seed="9" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 .45  0 0 0 0 .33  0 0 0 0 .16  0 0 0 .75 -.3"/>
  </filter>
  <filter id="wobble" x="-2%" y="-2%" width="104%" height="104%">
    <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="wash" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="5" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="1.4"/>
  </filter>
  <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
    <stop offset="60%" stop-color="${C("--ink")}" stop-opacity="0"/><stop offset="100%" stop-color="${C("--ink")}" stop-opacity=".28"/>
  </radialGradient>
  <clipPath id="land"><path d="${land}" clip-rule="evenodd"/></clipPath>
</defs>`;
  const world = el("g", {}, svg);
  const ink = C("--ink"), paper = C("--paper"), soft = C("--ink-soft");

  // sea, water lines, land
  el("rect", { x: -50, y: -50, width: W + 100, height: H + 100, fill: C("--sea") }, world);
  const waves = el("g", { filter: "url(#wobble)", fill: "none", stroke: C("--sea-line"), "stroke-linejoin": "round" }, world);
  ([[26, 0.13, "2 7"], [16, 0.2, "3 5"], [8, 0.32, ""]] as const).forEach(([w, o, da]) =>
    el("path", { d: land, "stroke-width": w, "stroke-opacity": o, "stroke-dasharray": da }, waves));
  el("path", { d: land, fill: paper, "fill-rule": "evenodd" }, world);

  // watercolour regions (Voronoi cells around the centres)
  const landG = el("g", { "clip-path": "url(#land)" }, world);
  const vor = Delaunay.from(centers).voronoi([-20, -20, W + 20, H + 20]);
  const washG = el("g", { filter: "url(#wash)" }, landG);
  const cells = REGIONS.map((r, i) => {
    const p = el("path", { d: vor.renderCell(i), class: "region" }, washG);
    // "region" in the text, so it is not mistaken for the place next to it
    p.addEventListener("pointerenter", e => { if (!drag) showTip(`${r.name} region · pasture ${r.pasture}`, e); });
    p.addEventListener("pointermove", e => { if (!drag) showTip(null, e); });
    p.addEventListener("pointerleave", () => { tip.hidden = true; });
    p.addEventListener("click", () => { if (!moved) select(r); });
    return p;
  });
  el("path", { d: REGIONS.map((_, i) => vor.renderCell(i)).join(""), class: "border" }, landG);
  const selPath = el("path", { class: "sel", filter: "url(#wobble)" }, landG);

  const roads = ROADS.map(s => s.map(([lon, lat]) => project(lon, lat)));
  // distance from a segment, to keep roads and passes clear of relief marks
  function segDist(px: number, py: number, [ax, ay]: Point, [bx, by]: Point) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  const nearWay = (x: number, y: number, s: number) =>
    GEO.passes.some(p => Math.hypot(x - p.x, y - p.y) < 17 + s * 0.6) ||
    roads.some(r => r.some((q, i) => i > 0 && segDist(x, y, r[i - 1], q) < 2 + s * 0.45));

  // terrain marks: dotted desert, tufted steppe, hills and mountains
  const occupied = new Set(GEO.marks.map(([x, y]) => `${Math.round(x / 18)},${Math.round(y / 18)}`));
  const texG = el("g", { "pointer-events": "none", stroke: soft, fill: soft }, landG);
  let dots = "", tufts = "";
  for (let y = 6; y < H; y += 11) for (let x = 6 + (y % 22 ? 5 : 0); x < W; x += 11) {
    const r = REGIONS[vor.delaunay.find(x, y)];
    if (occupied.has(`${Math.round(x / 18)},${Math.round(y / 18)}`)) continue;
    if (r.terrain === "desert" && rnd() < 0.55) { const px = x + j(8), py = y + j(8); dots += `M${px.toFixed(1)},${py.toFixed(1)}h.01`; }
    if (r.terrain === "steppe" && rnd() < 0.07) {
      const px = x + j(10), py = y + j(10);
      tufts += `M${(px - 3).toFixed(1)},${(py - 2.5).toFixed(1)}L${px.toFixed(1)},${py.toFixed(1)}L${(px + 3).toFixed(1)},${(py - 3).toFixed(1)}M${px.toFixed(1)},${py.toFixed(1)}L${(px + 0.3).toFixed(1)},${(py - 4).toFixed(1)}`;
    }
  }
  el("path", { d: dots, "stroke-width": 1.6, "stroke-linecap": "round", fill: "none", "stroke-opacity": 0.7 }, texG);
  el("path", { d: tufts, "stroke-width": 0.8, fill: "none", "stroke-opacity": 0.75 }, texG);
  const reliefG = el("g", { "pointer-events": "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, landG);
  GEO.marks.forEach(([x, y, s, k]) => {
    if (nearWay(x, y, s)) return;
    if (k === "h") {
      el("path", { d: `M${x - s},${y}Q${x + j(1.5)},${y - s * (0.9 + j(0.3))} ${x + s},${y}`, fill: "none", stroke: soft, "stroke-width": 0.9 }, reliefG);
      return;
    }
    drawPeak(x, y, s, k === "M", reliefG);
  });
  /** A mountain in ink: outline on paper and hatching on the shaded side, its base centred on (x, y). */
  function drawPeak(x: number, y: number, s: number, big: boolean, parent: Element) {
    const px = x + j(s * 0.3), py = y - s * ((big ? 1.3 : 1.05) + j(0.25));
    const g = el("g", {}, parent);
    el("path", { d: `M${x - s},${y}Q${x - s * 0.5},${y - s * 0.45} ${px},${py}Q${x + s * 0.45},${y - s * 0.5} ${x + s},${y}`, fill: paper, stroke: ink, "stroke-width": big ? 1.3 : 1.05 }, g);
    let h = "";
    const n = big ? 5 : 3;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1), hx = px + (x + s - px) * t * 0.85, hy = py + (y - py) * t * 0.85;
      h += `M${hx.toFixed(1)},${hy.toFixed(1)}L${(hx - s * 0.2).toFixed(1)},${(y - 1).toFixed(1)}`;
    }
    el("path", { d: h, fill: "none", stroke: ink, "stroke-width": big ? 0.85 : 0.7, "stroke-opacity": 0.85 }, g);
  }

  // names of the main ranges, in spaced italics along their crest
  const rangeG = el("g", { "pointer-events": "none" }, landG);
  const rangeTexts: SVGTextElement[] = [];
  RANGES.forEach(([name, pts], i) => {
    const d = pts.map(([lon, lat], k) => { const [x, y] = project(lon, lat); return `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join("");
    el("path", { id: `range-${i}`, d, fill: "none" }, rangeG);
    const t = el("text", { class: "range" }, rangeG);
    rangeTexts.push(t);
    const tp = el("textPath", { href: `#range-${i}`, startOffset: "50%", "text-anchor": "middle" }, t);
    tp.textContent = name;
  });

  // waters and coasts in ink
  const inkG = el("g", { filter: "url(#wobble)", fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, world);
  el("path", { d: GEO.lakes.join(""), fill: C("--sea"), stroke: C("--river"), "stroke-width": 0.9 }, inkG);
  GEO.rivers.forEach(rv => el("path", { d: rv.d, stroke: C("--river"), "stroke-width": rv.r <= 4 ? 2 : 1.2 }, inkG));
  el("path", { d: land, stroke: ink, "stroke-width": 1.5 }, inkG);

  // roads
  function smooth(pts: Point[]) {
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2 + j(10), my = (y0 + y1) / 2 + j(10);
      d += `Q${mx.toFixed(1)},${my.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
  }
  // the old main roads are drawn only outside the area of the movement graph, which has its own roads
  const graph = opts.graph;
  const box = graph && graph.sites.reduce((b, s) => {
    const [x, y] = project(s.lon, s.lat);
    return { x0: Math.min(b.x0, x - 25), y0: Math.min(b.y0, y - 25), x1: Math.max(b.x1, x + 25), y1: Math.max(b.y1, y + 25) };
  }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const inBox = ([x, y]: Point) => !!box && x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1;
  const roadG = el("g", { class: "fixed-stroke", fill: "none", stroke: C("--road"), "stroke-width": 1.4, "stroke-dasharray": "5 4", "stroke-linecap": "round", "stroke-opacity": 0.55, "pointer-events": "none", filter: "url(#wobble)" }, world);
  roads.forEach(r => {
    let run: Point[] = [];
    const flush = () => { if (run.length > 1) el("path", { d: smooth(run) }, roadG); run = []; };
    r.forEach((q, i) => {
      if (i === 0) { run = [q]; return; }
      const mid: Point = [(r[i - 1][0] + q[0]) / 2, (r[i - 1][1] + q[1]) / 2];
      if (inBox(mid)) { flush(); run = [q]; } else run.push(q);
    });
    flush();
  });

  // movement graph: links and route, under passes and cities.
  // Roads in red ink like the old roads, tracks dashed and mountain paths dotted, all thin and light.
  const linkG = el("g", { class: "fixed-stroke", fill: "none", "stroke-linecap": "round", "pointer-events": "none" }, world);
  graph?.links.forEach(l => {
    const [ax, ay] = project(graph.site(l.a).lon, graph.site(l.a).lat), [bx, by] = project(graph.site(l.b).lon, graph.site(l.b).lat);
    const road = l.kind === "road";
    el("path", {
      d: `M${ax.toFixed(1)},${ay.toFixed(1)}L${bx.toFixed(1)},${by.toFixed(1)}`,
      stroke: road ? C("--road") : ink, "stroke-opacity": road ? 0.6 : 0.42, "stroke-width": road ? 1.5 : 1.1,
      "stroke-dasharray": road ? "" : l.kind === "track" ? "5 4" : "1 4",
    }, linkG);
  });
  const previewPath = el("path", { class: "fixed-stroke", fill: "none", stroke: C("--label"), "stroke-width": 3, "stroke-opacity": 0.4, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": "3 5", "pointer-events": "none" }, world);
  const routePath = el("path", { class: "fixed-stroke", fill: "none", stroke: C("--label"), "stroke-width": 3.5, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": "9 5", "pointer-events": "none" }, world);

  // labels: collected here and then arranged by layoutLabels() to avoid overlaps
  type Candidate = [number, number, string];
  interface Box { x: number; y: number; width: number; height: number }
  const toPlace: { el: SVGTextElement; ax: number; ay: number; pri: number; cands: Candidate[]; choice?: Candidate }[] = [];
  const obstacles: Box[] = [];
  const RING: Candidate[] = [[10, 4, "start"], [-10, 4, "end"], [0, -9, "middle"], [0, 16, "middle"], [8, -7, "start"], [-8, -7, "end"], [8, 15, "start"], [-8, 15, "end"]];
  const PASS_LABEL: Record<string, Candidate> = {
    juyong: [10, -6, "start"], zijing: [-10, 16, "end"], gubeikou: [10, -8, "start"], yehuling: [-10, -8, "end"],
    yanmen: [-11, 4, "end"], niangzi: [0, 25, "middle"], tongguan: [0, -17, "middle"], yuguan: [10, 16, "start"],
  };
  /** unit direction of the way through a pass, from the places it links; west to east if it links none */
  function roadDirection(p: Pass): [number, number] {
    const ends = graph?.sites.some(s => s.id === p.id) ? graph.neighbours(p.id).map(n => graph.site(n.to)) : [];
    if (ends.length < 2) return [1, 0];
    const [ax, ay] = project(ends[0].lon, ends[0].lat), [bx, by] = project(ends.at(-1)!.lon, ends.at(-1)!.lat);
    const len = Math.hypot(bx - ax, by - ay) || 1;
    return [(bx - ax) / len, (by - ay) / len];
  }
  const passPeakG = el("g", { "pointer-events": "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, landG);
  const passG = el("g", {}, world);
  /** pass symbols shrink with the labels when zooming in */
  const passGlyphs: [SVGGElement, number, number][] = [];
  /** symbols drawn around (0, 0) and placed with a transform, scaled the same way */
  const markers: [SVGGElement, number, number][] = [];
  const targets = opts.targets ?? {};
  const targetGs = new Map<string, SVGGElement>();
  function drawTarget(id: string, x: number, y: number, parent: Element) {
    const t = el("g", { class: "target" }, parent);
    t.innerHTML = targetSymbol(targets[id]);
    markers.push([t, x, y]);
    targetGs.set(id, t);
  }
  const tipText = (id: string, name: string, fallback: string) =>
    targets[id] ? `${name} · ${targetGs.get(id)?.classList.contains("taken") ? "taken" : TARGET_TEXT[targets[id]]}` : fallback;
  GEO.passes.forEach(p => {
    const g = el("g", { class: "pass", tabindex: 0, role: "button", "aria-label": p.name }, passG);
    // the pass as a gap in the range: a peak on each side, across the road that goes through it
    const [rx, ry] = roadDirection(p);
    const ux = -ry, uy = rx;
    // the peaks belong to the relief, so they keep its size when zooming; the lower one last, on top
    for (const side of uy >= 0 ? [-1, 1] : [1, -1]) drawPeak(p.x + side * 12 * ux, p.y + side * 12 * uy + 4, 8, true, passPeakG);
    const glyph = el("g", {}, g);
    passGlyphs.push([glyph, p.x, p.y]);
    el("circle", { cx: p.x, cy: p.y, r: 12, fill: "transparent" }, glyph);
    const sx = (side: number) => p.x + side * 7 * ux, sy = (side: number) => p.y + side * 7 * uy;
    const bracket = (side: number) =>
      `M${(sx(side) - 6 * rx).toFixed(1)},${(sy(side) - 6 * ry).toFixed(1)}Q${(p.x + side * 2.5 * ux).toFixed(1)},${(p.y + side * 2.5 * uy).toFixed(1)} ${(sx(side) + 6 * rx).toFixed(1)},${(sy(side) + 6 * ry).toFixed(1)}`;
    if (targets[p.id]) drawTarget(p.id, p.x, p.y, g);
    else el("path", { class: "pmark", d: bracket(-1) + bracket(1), fill: "none", stroke: C("--road"), "stroke-width": 2.2, "stroke-linecap": "round" }, glyph);
    const [dx, dy, anc] = PASS_LABEL[p.id] ?? [10, -8, "start"];
    const t = el("text", { x: p.x + dx, y: p.y + dy, "text-anchor": anc, class: "pname" }, g);
    t.textContent = p.name.replace(" Pass", "");
    obstacles.push({ x: p.x - 12, y: p.y - 12, width: 24, height: 24 });
    toPlace.push({ el: t, ax: p.x, ay: p.y, pri: 0, cands: [[dx, dy, anc], [15, 4, "start"], [-15, 4, "end"], [0, -17, "middle"], [0, 25, "middle"], [13, -10, "start"], [-13, -10, "end"], [13, 20, "start"], [-13, 20, "end"]] });
    const show = (e: PointerEvent) => { if (!drag) showTip(tipText(p.id, p.name, p.name + " · pass"), e); };
    g.addEventListener("pointerenter", show);
    g.addEventListener("pointermove", show);
    g.addEventListener("pointerleave", () => { tip.hidden = true; });
    const pick = () => { if (!moved) opts.onSelectPass?.(p); };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });

  // cities
  const cityG = el("g", { "pointer-events": "none" }, world);
  const graphNames = new Set(graph?.sites.map(s => s.name));
  CITIES.forEach(c => {
    if (graphNames.has(c.name)) return;
    const [x, y] = project(c.lon, c.lat);
    if (c.capital) {
      el("circle", { cx: x, cy: y, r: 5, fill: paper, stroke: ink, "stroke-width": 1.2 }, cityG);
      el("circle", { cx: x, cy: y, r: 2, fill: C("--label") }, cityG);
    } else el("rect", { x: x - 3, y: y - 3, width: 6, height: 6, fill: paper, stroke: ink, "stroke-width": 1.1 }, cityG);
    const t = el("text", { x: x + 8, y: y + 4, class: "city" }, cityG);
    t.textContent = c.name;
    obstacles.push({ x: x - 5, y: y - 5, width: 10, height: 10 });
    toPlace.push({ el: t, ax: x, ay: y, pri: 1, cands: RING });
  });

  // sites of the movement graph: clickable, labelled when they are towns or pastures
  const siteG = el("g", {}, world);
  // the selection: a double ring in red ink, like a stamp, sized on the symbol it surrounds
  const selRing = el("g", { fill: "none", stroke: C("--label"), "pointer-events": "none", filter: "url(#wobble)" });
  const selInner = el("circle", { "stroke-width": 1.8 }, selRing), selOuter = el("circle", { "stroke-width": 0.9, "stroke-dasharray": "4 2.5" }, selRing);
  const selMark: [SVGGElement, number, number] = [selRing, 0, 0];
  markers.push(selMark);
  const selSize = new Map<string, number>();
  const KIND_TEXT: Record<Site["kind"], string> = { city: "town", pasture: "pasture", pass: "pass", junction: "crossroads" };
  const capitals = new Set(CITIES.filter(c => c.capital).map(c => c.name)), drawnPasses = new Set(GEO.passes.map(p => p.id));
  graph?.sites.forEach(site => {
    const [x, y] = project(site.lon, site.lat);
    const g = el("g", { class: "site", tabindex: 0, role: "button", "aria-label": site.name }, siteG);
    const passDrawn = site.kind === "pass" && drawnPasses.has(site.id);
    selSize.set(site.id, targets[site.id] || passDrawn ? 15 : site.kind === "junction" ? 7 : 10);
    if (targets[site.id] && !passDrawn) {
      el("circle", { cx: x, cy: y, r: 9, fill: "transparent" }, g);
      drawTarget(site.id, x, y, g);
    } else {
      const mk = el("g", {}, g);
      markers.push([mk, x, y]);
      el("circle", { r: 8, fill: "transparent" }, mk);
      if (site.kind === "pasture") {
        el("path", { d: "M-4,-2L-1,2L1,-3M1,2L4,-2", fill: "none", stroke: C("--p-high"), "stroke-width": 1.4, "stroke-linecap": "round" }, mk);
      } else if (site.kind === "pass" && !passDrawn) {
        el("path", { d: "M-4,-4Q-1,0 -4,4M4,-4Q1,0 4,4", fill: "none", stroke: C("--road"), "stroke-width": 1.8, "stroke-linecap": "round" }, mk);
      } else if (site.kind === "junction") {
        el("circle", { r: 1.8, fill: ink, "fill-opacity": 0.55 }, mk);
      } else if (site.kind === "city" && capitals.has(site.name)) {
        el("circle", { r: 5, fill: paper, stroke: ink, "stroke-width": 1.2 }, mk);
        el("circle", { r: 2, fill: C("--label") }, mk);
      } else if (site.kind === "city") {
        el("rect", { x: -3, y: -3, width: 6, height: 6, fill: paper, stroke: ink, "stroke-width": 1.1 }, mk);
      }
    }
    const labelled = site.kind === "city" || site.kind === "pasture" || (site.kind === "pass" && !passDrawn);
    if (labelled) {
      const t = el("text", { x: x + 7, y: y + 3, class: site.kind === "pass" ? "pname" : site.kind === "pasture" ? "city small" : "city" }, g);
      t.textContent = site.kind === "pass" ? site.name.replace(" Pass", "") : site.name;
      toPlace.push({ el: t, ax: x, ay: y, pri: 1, cands: RING });
    }
    obstacles.push({ x: x - 3, y: y - 3, width: 6, height: 6 });
    g.addEventListener("pointerenter", e => { if (!drag) { showTip(tipText(site.id, site.name, `${site.name} · ${KIND_TEXT[site.kind]}`), e); opts.onHoverSite?.(site); } });
    g.addEventListener("pointermove", e => { if (!drag) showTip(null, e); });
    g.addEventListener("pointerleave", () => { tip.hidden = true; opts.onHoverSite?.(null); });
    const pick = () => { if (!moved) opts.onSelectSite?.(site); };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
  siteG.appendChild(selRing);
  selRing.style.display = "none";

  // region names
  const nameG = el("g", {}, world);
  REGIONS.forEach((r, i) => {
    const [cx, cy] = centers[i];
    const t = el("text", { x: cx, y: cy + 26, "text-anchor": "middle", class: "rname" }, nameG);
    t.textContent = r.name;
    const cands: Candidate[] = [];
    for (const dy of [26, -14, 44, -32, 62, -50, 80]) for (const dx of [0, -30, 30, -60, 60]) cands.push([dx, dy, "middle"]);
    toPlace.push({ el: t, ax: cx, ay: cy, pri: 2, cands });
  });

  /**
   * Chooses where each label goes, once, for the most zoomed-out view, where labels are biggest
   * compared with the map. Zooming in only shrinks them around their anchors, so the same choice
   * still has no overlaps and labels do not jump from one side to the other while zooming.
   */
  function layoutLabels() {
    const placed = obstacles.map(b => ({ ...b }));
    const pad = 2;
    const hit = (a: Box, b: Box) => !(a.x + a.width + pad < b.x || b.x + b.width + pad < a.x || a.y + a.height + pad < b.y || b.y + b.height + pad < a.y);
    const area = (a: Box, b: Box) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const ls = maxW() / (stage.clientWidth || W);
    svg.style.setProperty("--ls", String(ls));
    // range names are fixed along their crest: other labels keep clear of them
    for (const t of rangeTexts) { const b = t.getBBox(); placed.push({ x: b.x, y: b.y, width: b.width, height: b.height }); }
    [...toPlace].sort((a, b) => a.pri - b.pri).forEach(L => {
      let best: [Candidate, Box] | null = null, bestCost = Infinity;
      for (const cand of L.cands) {
        const [cx, cy, anc] = cand;
        L.el.setAttribute("x", String(L.ax + cx * ls)); L.el.setAttribute("y", String(L.ay + cy * ls)); L.el.setAttribute("text-anchor", anc);
        const b = L.el.getBBox();
        const outside = b.x < 4 || b.y < 4 || b.x + b.width > W - 4 || b.y + b.height > H - 4 ? 1e6 : 0;
        const cost = outside + placed.reduce((s, o) => s + (hit(b, o) ? 1000 + area(b, o) : 0), 0);
        if (cost < bestCost) { bestCost = cost; best = [cand, { x: b.x, y: b.y, width: b.width, height: b.height }]; }
        if (cost === 0) break;
      }
      if (!best) return;
      L.choice = best[0];
      placed.push(best[1]);
    });
    svg.style.setProperty("--ls", String(labelScale()));
    placeLabels();
  }
  /** puts each label at its chosen place for the current zoom */
  function placeLabels() {
    // symbols stop shrinking at 0.4 (see setVB): beyond that the gap from them stops shrinking too
    const ls = Math.max(0.4, labelScale());
    for (const L of toPlace) {
      if (!L.choice) continue;
      const [cx, cy, anc] = L.choice;
      L.el.setAttribute("x", String(L.ax + cx * ls)); L.el.setAttribute("y", String(L.ay + cy * ls)); L.el.setAttribute("text-anchor", anc);
    }
  }

  // compass rose and scale bar, inside the map
  const rose = el("g", { transform: `translate(${W - 70},${H - 230})`, "pointer-events": "none", stroke: ink, "stroke-width": 1 }, world);
  el("circle", { r: 26, fill: "none", "stroke-opacity": 0.6 }, rose);
  el("path", { d: "M0,-38L6,0L0,38L-6,0Z", fill: paper }, rose);
  el("path", { d: "M0,-38L6,0L-6,0Z", fill: ink }, rose);
  el("path", { d: "M-30,0L0,4L30,0L0,-4Z", fill: paper }, rose);
  el("text", { y: -44, "text-anchor": "middle", class: "rname", style: "font-size:14px", stroke: "none" }, rose).textContent = "N";
  const pxPerKm = 0.54; // at this latitude
  const scale = el("g", { transform: `translate(${W - 170},${H - 60})`, "pointer-events": "none" }, world);
  [0, 1, 2, 3].forEach(i => el("rect", { x: i * 50 * pxPerKm, y: 0, width: 50 * pxPerKm, height: 5, fill: i % 2 ? paper : ink, stroke: ink, "stroke-width": 0.8 }, scale));
  el("text", { x: 0, y: -6, class: "city" }, scale).textContent = "200 km";

  // the army's columns: a helmet each, drawn when the game says where they are
  const columnLayer = el("g", {}, world);
  const columnGs: { g: SVGGElement; name: SVGTextElement; bar: SVGRectElement }[] = [];
  let columnMarks: readonly ColumnMark[] = [];
  function columnG(i: number) {
    while (columnGs.length <= i) {
      const k = columnGs.length;
      const g = el("g", { class: "column-mark", tabindex: 0, role: "button" }, columnLayer);
      el("circle", { r: 16, cy: -6, fill: "transparent" }, g);
      el("g", {}, g).innerHTML = helmet();
      const name = el("text", { x: 17, y: -10, class: "city", style: "font-weight:600;font-size:15px;stroke-width:3px" }, g);
      // the horses' condition at a glance, without opening a panel
      el("rect", { x: -13, y: 12, width: 26, height: 5, rx: 1.5, fill: paper, stroke: ink, "stroke-width": 0.7 }, g);
      const bar = el("rect", { x: -12.5, y: 12.5, width: 25, height: 4, rx: 1.2 }, g);
      const pick = () => { if (!moved) opts.onSelectColumn?.(k); };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      columnGs.push({ g, name, bar });
    }
    return columnGs[i];
  }

  // paper: grain, stains and darkened edges on top of everything
  el("rect", { x: -50, y: -50, width: W + 100, height: H + 100, filter: "url(#blotch)", "pointer-events": "none", style: "mix-blend-mode:multiply" }, world);
  el("rect", { x: -50, y: -50, width: W + 100, height: H + 100, filter: "url(#grain)", "pointer-events": "none", opacity: 0.7 }, world);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#vignette)", "pointer-events": "none" }, svg);

  function paint() {
    cells.forEach((p, i) => {
      const f = regionFill(REGIONS[i], layer);
      p.setAttribute("fill", f ?? "transparent");
      p.setAttribute("fill-opacity", String(f ? 0.42 : 0));
    });
    selPath.setAttribute("d", selected ? vor.renderCell(selected.id) : "");
  }
  /** null keeps the text, so the game can add to it on hover (a route's length, the horses on arrival) */
  function showTip(text: string | null, e: PointerEvent) {
    const b = stage.getBoundingClientRect();
    tip.hidden = false;
    if (text !== null) tip.textContent = text;
    tip.style.left = e.clientX - b.left + "px";
    tip.style.top = e.clientY - b.top + "px";
  }
  function select(r: Region) {
    selected = r;
    paint();
    opts.onSelectRegion?.(r);
  }

  // zoom and panning. The view follows the shape of the stage, so the map can fill the screen.
  let aspect = stage.clientWidth && stage.clientHeight ? stage.clientHeight / stage.clientWidth : H / W;
  const maxW = () => Math.min(W, H / aspect);
  let vb = { x: 0, y: 0, w: W, h: H };
  clampVB();
  /** svg units per screen pixel: labels and symbols are scaled by it to keep a steady size on screen */
  const labelScale = () => vb.w / (stage.clientWidth || W);
  const sitePoints = (graph?.sites ?? []).map(st => project(st.lon, st.lat));
  function drawColumn() {
    const k = Math.min(1.2, Math.max(0.4, labelScale()));
    // columns at the same place stand side by side instead of on top of each other
    const seen = new Map<string, number>();
    columnMarks.forEach((m, i) => {
      const [x, y] = project(m.lon, m.lat);
      const key = `${x.toFixed(0)},${y.toFixed(0)}`, n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      // at a town or pass the helmet stands just above it, so the place underneath can still be clicked
      const lift = sitePoints.some(([sx, sy]) => Math.abs(sx - x) < 1 && Math.abs(sy - y) < 1) ? COLUMN_LIFT : 0;
      columnG(i).g.setAttribute("transform", `translate(${x + n * 30 * k},${y + (n * 38 - lift) * k}) scale(${k})`);
    });
  }
  let drag: { x: number; y: number; vx: number; vy: number } | null = null, moved = false;
  // labels shrink when zooming in, so they stay readable without covering the map
  let relayout = 0;
  const setVB = () => {
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const ls = labelScale();
    svg.style.setProperty("--ls", String(ls));
    const k = Math.min(1, Math.max(0.4, ls));
    for (const [g, x, y] of passGlyphs) g.setAttribute("transform", `translate(${x},${y}) scale(${k}) translate(${-x},${-y})`);
    for (const [g, x, y] of markers) g.setAttribute("transform", `translate(${x},${y}) scale(${k})`);
    drawColumn();
    placeLabels();
  };
  function clampVB() {
    vb.w = Math.min(maxW(), Math.max(W / 8, vb.w)); vb.h = vb.w * aspect;
    vb.x = Math.min(W - vb.w, Math.max(0, vb.x)); vb.y = Math.min(H - vb.h, Math.max(0, vb.y));
  }
  function zoomAt(f: number, cx: number, cy: number) {
    // clamp the new width first: computing the origin with a width that clampVB() then changes
    // would shift the view at every wheel step once the zoom limit is reached
    const nw = Math.min(maxW(), Math.max(W / 8, vb.w * f));
    vb.x = cx - ((cx - vb.x) * nw) / vb.w; vb.y = cy - ((cy - vb.y) * nw) / vb.w; vb.w = nw;
    clampVB(); setVB();
  }
  function svgPoint(e: MouseEvent): Point {
    const b = svg.getBoundingClientRect();
    return [vb.x + ((e.clientX - b.left) * vb.w) / b.width, vb.y + ((e.clientY - b.top) * vb.h) / b.height];
  }
  svg.addEventListener("wheel", e => { e.preventDefault(); const [x, y] = svgPoint(e); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, x, y); }, { passive: false });
  svg.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; moved = false; });
  window.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true; svg.classList.add("drag"); tip.hidden = true;
    const b = svg.getBoundingClientRect();
    vb.x = drag.vx - (dx * vb.w) / b.width; vb.y = drag.vy - (dy * vb.h) / b.height;
    clampVB(); setVB();
  });
  window.addEventListener("pointerup", () => { drag = null; svg.classList.remove("drag"); setTimeout(() => (moved = false), 0); });

  // follow the size of the stage, keeping the centre of the view
  new ResizeObserver(() => {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    aspect = r.height / r.width;
    vb.h = vb.w * aspect;
    clampVB();
    vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
    clampVB(); setVB();
    // the most zoomed-out view depends on the shape of the stage: choose the label places again
    clearTimeout(relayout);
    relayout = window.setTimeout(layoutLabels, 150);
  }).observe(stage);

  paint();
  layoutLabels();
  // the map fonts arrive after the first draw: once they are ready, lay out the labels again
  Promise.all(['15px "IM Fell English SC"', 'italic 13px "IM Fell English"'].map(f => document.fonts.load(f).catch(() => null)))
    .then(() => document.fonts.ready)
    .then(layoutLabels);
  document.fonts.addEventListener("loadingdone", layoutLabels);

  return {
    setLayer(l) { layer = l; paint(); },
    zoom(f) { zoomAt(f, vb.x + vb.w / 2, vb.y + vb.h / 2); },
    resetView() { vb = { x: 0, y: 0, w: W, h: H }; clampVB(); vb.x = (W - vb.w) / 2; vb.y = (H - vb.h) / 2; setVB(); },
    setColumns(cols) {
      columnMarks = cols;
      // a loaded game can have fewer columns than the one before it
      columnGs.forEach((c, i) => { c.g.style.display = i < cols.length ? "" : "none"; });
      cols.forEach((m, i) => {
        const { g, name, bar } = columnG(i);
        if (name.textContent !== m.name) { name.textContent = m.name; g.setAttribute("aria-label", `${m.name}'s column`); }
        g.classList.toggle("active", m.active);
        bar.setAttribute("width", (25 * Math.max(0.04, Math.min(1, m.condition / 100))).toFixed(1));
        bar.setAttribute("fill", C(`--${m.level}`));
      });
      // the active column on top
      const front = cols.findIndex(m => m.active);
      if (front >= 0 && columnLayer.lastChild !== columnG(front).g) columnLayer.append(columnG(front).g);
      drawColumn();
    },
    setPreview(points) {
      previewPath.setAttribute("d", points.map(([lon, lat], i) => { const [x, y] = project(lon, lat); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(""));
    },
    setRoute(points) {
      routePath.setAttribute("d", points.map(([lon, lat], i) => { const [x, y] = project(lon, lat); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(""));
    },
    selectSite(id) {
      const site = id ? graph?.sites.find(s => s.id === id) : undefined;
      selRing.style.display = site ? "" : "none";
      if (site) {
        const [x, y] = project(site.lon, site.lat), r = selSize.get(site.id) ?? 10;
        selInner.setAttribute("r", String(r));
        selOuter.setAttribute("r", String(r + 3.5));
        selMark[1] = x; selMark[2] = y;
        selRing.setAttribute("transform", `translate(${x},${y}) scale(${Math.min(1, Math.max(0.4, labelScale()))})`);
      }
    },
    setTaken(ids) {
      for (const [id, g] of targetGs) g.classList.toggle("taken", ids.includes(id));
    },
    focus(lon0, lat0, lon1, lat1) {
      const [x0, y0] = project(lon0, lat1), [x1, y1] = project(lon1, lat0);
      const w = Math.max(x1 - x0, (y1 - y0) / aspect), h = w * aspect;
      vb = { x: (x0 + x1 - w) / 2, y: (y0 + y1 - h) / 2, w, h };
      clampVB(); setVB();
    },
  };
}
