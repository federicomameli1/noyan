import "./style.css";
import {
  MONTH_NAMES, PACES, SCENARIO, SECONDS_PER_DAY, SPEEDS, campSite, columnPosition, conditionBand, dateOf, dropFlock, effectivePace,
  findPath, foodDays, formatDate, newGame, orderHalt, orderMarch, pastureDensity, setPace, speedFactor, step, takeFlock,
  type GameState, type PaceId, type Site,
} from "./sim";
import { LABELS, cssVar, createMap, helmet, mix, type Layer } from "./ui/map";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const info = $("info");
const graph = SCENARIO.graph;
const fmt = (n: number) => Math.round(n).toLocaleString("en");
/** replaces an element's content only when it changed, so buttons inside stay clickable while the game runs */
function setHTML(el: HTMLElement, html: string): boolean {
  if (el.dataset.html === html) return false;
  el.dataset.html = html;
  el.innerHTML = html;
  return true;
}

let game: GameState = newGame(0);
let flock = 0;
let started = false;
let playing = false;
let speed: number = SPEEDS[0];
let selected: Site | null = null;

const map = createMap({
  container: $("stage"),
  tooltip: $("tip"),
  graph,
  onSelectRegion: r => {
    selected = null;
    map.selectSite(null);
    setHTML(info, `<h3>${r.name}</h3><dl>
      <dt>Terrain</dt><dd>${LABELS.terrain[r.terrain]}</dd><dt>Pasture</dt><dd>${r.pasture} / 100</dd>
      <dt>Control</dt><dd>${LABELS.political[r.control]}</dd><dt>Diplomacy</dt><dd>${LABELS.diplomatic[r.diplomacy]}</dd>
      <dt>Coordinates</dt><dd>${r.lat.toFixed(1)}° N, ${r.lon.toFixed(1)}° E</dd></dl>`);
  },
  onSelectPass: p => {
    const site = graph.sites.find(s => s.id === p.id);
    if (site) selectSite(site, p.desc);
    else setHTML(info, `<h3>${p.name}</h3><p style="margin:0">${p.desc}</p>`);
  },
  onSelectSite: s => selectSite(s),
});
map.focus(111.4, 37.1, 116.6, 41.6);

// --- start screen: choose the flock ---
const flocks = $("flocks");
SCENARIO.flockOptions.forEach(n => {
  const b = document.createElement("button");
  b.textContent = n ? fmt(n) : "None";
  b.setAttribute("aria-pressed", String(n === flock));
  b.onclick = () => {
    flock = n;
    flocks.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    game = newGame(flock);
    render();
  };
  flocks.append(b);
});
$("begin").onclick = () => {
  started = true;
  $("start").hidden = true;
  $("controls").hidden = false;
  setPlaying(true);
  render();
};

// --- time ---
const speeds = $("speeds");
SPEEDS.forEach(v => {
  const b = document.createElement("button");
  b.textContent = v + "x";
  b.dataset.speed = String(v);
  b.onclick = () => { speed = v; render(); };
  speeds.append(b);
});
function setPlaying(on: boolean) {
  playing = on && !game.over;
  $("play").textContent = playing ? "Pause" : "Play";
  $("play").setAttribute("aria-pressed", String(playing));
}
$("play").onclick = () => setPlaying(!playing);
document.addEventListener("keydown", e => {
  if (e.key === " " && started && e.target === document.body) { e.preventDefault(); setPlaying(!playing); }
});

// --- orders ---
document.querySelectorAll<HTMLButtonElement>("#paces button").forEach(b => {
  b.onclick = () => { setPace(game, 0, b.dataset.pace as PaceId); render(); };
});
$("halt").onclick = () => { orderHalt(game, 0); render(); };
$("drop").onclick = () => { dropFlock(game, 0); render(); };
$("take").onclick = () => { takeFlock(game, 0); render(); };

function march(id: string) {
  if (!started) return;
  orderMarch(game, 0, id);
  if (!playing) setPlaying(true);
  render();
}

// --- panels ---
function selectSite(s: Site, desc?: string) {
  selected = s;
  map.selectSite(s.id);
  renderSite(desc);
}

const KIND = { city: "Town", pass: "Mountain pass", junction: "Crossroads", pasture: "Pasture grounds" };
let siteDesc: string | undefined;
function renderSite(desc = siteDesc) {
  siteDesc = desc;
  const s = selected;
  if (!s) return;
  const date = dateOf(game);
  const st = game.sites[s.id];
  const density = pastureDensity(s, date.month, st);
  const col = game.columns[0];
  const here = col.at === s.id;
  const path = col.at ? findPath(graph, col.at, s.id) : null;
  const changed = setHTML(info, `<h3>${s.name}</h3>${desc ? `<p class="note">${desc}</p>` : ""}<dl>
    <dt>Place</dt><dd>${KIND[s.kind]}</dd>
    <dt>Terrain</dt><dd>${LABELS.terrain[s.terrain]}</dd>
    <dt>Held by</dt><dd>${LABELS.political[s.control]}</dd>
    <dt>Grass now</dt><dd>${density.toFixed(1)} t/km² in ${MONTH_NAMES[date.month]}${st.grazed > 1 ? `, ${fmt(st.grazed)} t grazed` : ""}</dd>
    <dt>Water</dt><dd>${s.water ? "Yes" : "No, a dry camp"}</dd>
    ${st.sheep > 0 ? `<dt>Flock left here</dt><dd>${fmt(st.sheep)} sheep</dd>` : ""}
    ${path ? `<dt>Route</dt><dd>${path.length - 1} stages</dd>` : ""}
  </dl><div class="actions">${started && !here ? `<button class="primary" id="go">March here</button>` : ""}</div>`);
  if (changed) info.querySelector<HTMLButtonElement>("#go")?.addEventListener("click", () => march(s.id));
}

function meter(value: number, text: string) {
  return `<div class="meter"><i><b style="width:${Math.max(0, Math.min(100, value))}%"></b></i><span>${text}</span></div>`;
}

const BAND = { fat: "fat", fit: "fit", thin: "thin", exhausted: "exhausted" };
function renderColumn() {
  const c = game.columns[0];
  const camp = campSite(c);
  const where = c.at
    ? (c.route.length && !c.halted ? `Leaving ${graph.site(c.at).name} for ${graph.site(c.route.at(-1)!).name}` : `Camped at ${graph.site(c.at).name}`)
    : `${c.halted ? "Halted" : "Marching"} between ${graph.site(c.leg!.from).name} and ${graph.site(c.leg!.to).name}` +
      (c.route.length && !c.halted ? `, bound for ${graph.site(c.route.at(-1)!).name}` : "");
  const pace = effectivePace(c);
  setHTML($("column"), `<h3>${c.name}'s column</h3><p class="note">${where}</p><dl>
    <dt>Men</dt><dd>${fmt(c.men)}</dd>
    <dt>Horses</dt><dd>${fmt(c.horses)} (${(c.horses / Math.max(1, c.men)).toFixed(1)} per man)</dd>
    <dt>Sheep</dt><dd>${fmt(c.sheep)}</dd>
    <dt>Food</dt><dd>${foodDays(c).toFixed(0)} days</dd>
    <dt>Condition</dt><dd>${meter(c.condition, `${c.condition.toFixed(0)}, ${BAND[conditionBand(c.condition)]}`)}</dd>
    <dt>Fatigue</dt><dd>${meter(c.fatigue, c.fatigue.toFixed(0))}</dd>
    <dt>Pace</dt><dd>${pace[0].toUpperCase() + pace.slice(1)}${c.sheep > 0 && c.pace !== "grazing" ? " (the flock sets the pace)" : ""}, ${Math.round(PACES[pace].marchHours * PACES[pace].kmPerHour * speedFactor(c))} km a day on a road</dd>
    <dt>Grass at camp</dt><dd>${pastureDensity(camp, dateOf(game).month, game.sites[camp.id]).toFixed(1)} t/km²</dd>
  </dl>`);
}

let logCount = -1;
function renderLog() {
  if (game.log.length === logCount) return;
  logCount = game.log.length;
  $("log").innerHTML = game.log.slice(-40).reverse().map(l => {
    const d = dateOf({ ...game, hour: l.hour });
    return `<li><span>${d.day} ${MONTH_NAMES[d.month].slice(0, 3)}</span>${l.text}</li>`;
  }).join("");
}

function renderRoute() {
  const c = game.columns[0];
  if (c.halted || (!c.leg && !c.route.length)) { map.setRoute([]); return; }
  const pts: [number, number][] = [columnPosition(c)];
  for (const id of c.leg ? [c.leg.to, ...c.route] : c.route) { const s = graph.site(id); pts.push([s.lon, s.lat]); }
  map.setRoute(pts);
}

function render() {
  const d = dateOf(game);
  $("date").textContent = formatDate(d);
  $("clock-hour").textContent = `${String(d.hour).padStart(2, "0")}:00${game.over ? " · season over" : ""}`;
  speeds.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === speed)));
  const c = game.columns[0];
  document.querySelectorAll<HTMLButtonElement>("#paces button").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.pace === effectivePace(c)));
    b.disabled = c.sheep > 0 && b.dataset.pace !== "grazing";
  });
  ($("drop") as HTMLButtonElement).disabled = !c.at || c.sheep <= 0;
  ($("take") as HTMLButtonElement).disabled = !c.at || game.sites[c.at].sheep <= 0;
  ($("halt") as HTMLButtonElement).disabled = c.halted || (!c.leg && !c.route.length);
  const [lon, lat] = columnPosition(c);
  map.placeColumn(lon, lat);
  renderRoute();
  renderColumn();
  renderLog();
  renderSite();
  if (game.over) setPlaying(false);
}

// --- main loop: one simulation step per game hour ---
const MS_PER_HOUR = (SECONDS_PER_DAY * 1000) / 24;
let last = performance.now(), acc = 0, lastPanel = 0;
function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  if (playing) {
    acc += dt * speed;
    let stepped = false;
    while (acc >= MS_PER_HOUR && !game.over) { acc -= MS_PER_HOUR; step(game); stepped = true; }
    // panels at most 5 times a second; the column marker every frame it moves
    if (stepped && now - lastPanel > 200) { lastPanel = now; render(); }
    else if (stepped) { const [lon, lat] = columnPosition(game.columns[0]); map.placeColumn(lon, lat); renderRoute(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
render();

function legend(layer: Layer) {
  const C = cssVar;
  const sw = (c: string) => `<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" fill="${c}"/></svg>`;
  $("leg-title").textContent = "Legend · " + ($("layers").querySelector(`[data-layer="${layer}"]`)?.textContent ?? "").toLowerCase();
  const symbols = `<dt><svg width="18" height="14" aria-hidden="true"><path d="M2,13Q5,9 9,2Q12,8 16,13" fill="${C("--paper")}" stroke="${C("--ink")}"/></svg></dt><dd>Mountains</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><circle cx="9" cy="7" r="5" fill="${C("--paper")}" stroke="${C("--ink")}"/><circle cx="9" cy="7" r="2" fill="${C("--label")}"/></svg></dt><dd>Capital</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><rect x="6" y="4" width="6" height="6" fill="${C("--paper")}" stroke="${C("--ink")}"/></svg></dt><dd>City</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M3,1Q8,7 3,13M15,1Q10,7 15,13" fill="none" stroke="${C("--road")}" stroke-width="2.2" stroke-linecap="round"/></svg></dt><dd>Pass (click it for details)</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M1,7H17" stroke="${C("--road")}" stroke-width="1.5" stroke-dasharray="4 3"/></svg></dt><dd>Main road</dd>
    <dt><svg width="18" height="18" viewBox="-18 -26 36 36" aria-hidden="true">${helmet()}</svg></dt><dd>Muqali's column</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M1,7H17" stroke="${C("--ink")}" stroke-opacity=".6"/></svg></dt><dd>Route between places (dotted: track or mountain path)</dd>`;
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
