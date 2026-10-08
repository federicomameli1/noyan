import "./style.css";
import { LABELS, cssVar, createMap, helmet, mix, type Layer } from "./ui/map";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const info = $("info");

const map = createMap({
  container: $("stage"),
  tooltip: $("tip"),
  onSelectRegion: r => {
    info.innerHTML = `<h3>${r.name}</h3><dl>
      <dt>Terrain</dt><dd>${LABELS.terrain[r.terrain]}</dd><dt>Pasture</dt><dd>${r.pasture} / 100</dd>
      <dt>Control</dt><dd>${LABELS.political[r.control]}</dd><dt>Diplomacy</dt><dd>${LABELS.diplomatic[r.diplomacy]}</dd>
      <dt>Coordinates</dt><dd>${r.lat.toFixed(1)}° N, ${r.lon.toFixed(1)}° E</dd></dl>`;
  },
  onSelectPass: p => {
    info.innerHTML = `<h3>${p.name}</h3><p style="margin:0">${p.desc}</p>`;
  },
});
// for now the column stands still at Datong; layer 0 will move it along the road graph
map.placeColumn(113.3, 40.1);

function legend(layer: Layer) {
  const C = cssVar;
  const sw = (c: string) => `<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" fill="${c}"/></svg>`;
  $("leg-title").textContent = "Legend · " + ($("layers").querySelector(`[data-layer="${layer}"]`)?.textContent ?? "").toLowerCase();
  const symbols = `<dt><svg width="18" height="14" aria-hidden="true"><path d="M2,13Q5,9 9,2Q12,8 16,13" fill="${C("--paper")}" stroke="${C("--ink")}"/></svg></dt><dd>Mountains</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><circle cx="9" cy="7" r="5" fill="${C("--paper")}" stroke="${C("--ink")}"/><circle cx="9" cy="7" r="2" fill="${C("--label")}"/></svg></dt><dd>Capital</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><rect x="6" y="4" width="6" height="6" fill="${C("--paper")}" stroke="${C("--ink")}"/></svg></dt><dd>City</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M3,1Q8,7 3,13M15,1Q10,7 15,13" fill="none" stroke="${C("--road")}" stroke-width="2.2" stroke-linecap="round"/></svg></dt><dd>Pass (click it for details)</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M1,7H17" stroke="${C("--road")}" stroke-width="1.5" stroke-dasharray="4 3"/></svg></dt><dd>Main road</dd>
    <dt><svg width="18" height="18" viewBox="-18 -26 36 36" aria-hidden="true">${helmet()}</svg></dt><dd>Muqali's column</dd>`;
  let items = "";
  if (layer === "pasture") {
    items = `<dt>${sw(mix(C("--p-low"), C("--p-high"), 0.15))}</dt><dd>Poor pasture</dd><dt>${sw(mix(C("--p-low"), C("--p-high"), 0.5))}</dt><dd>Average</dd><dt>${sw(C("--p-high"))}</dt><dd>Rich pasture</dd>`;
  } else if (layer !== "map") {
    const prefix = { terrain: "--t-", political: "--pol-", diplomatic: "--dip-" }[layer];
    items = Object.entries(LABELS[layer]).map(([k, v]) => `<dt>${sw(C(prefix + k))}</dt><dd>${v}</dd>`).join("");
  }
  $("legend").innerHTML = items + symbols;
}

document.querySelectorAll<HTMLButtonElement>("#layers button").forEach(b =>
  b.addEventListener("click", () => {
    const l = b.dataset.layer as Layer;
    document.querySelectorAll("#layers button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    map.setLayer(l);
    legend(l);
  }),
);
$("zin").onclick = () => map.zoom(1 / 1.4);
$("zout").onclick = () => map.zoom(1.4);
$("zreset").onclick = () => map.resetView();
legend("pasture");
