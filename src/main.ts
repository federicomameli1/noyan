import "./style.css";
import {
  MONTH_NAMES, PACES, SCENARIO, SECONDS_PER_DAY, SPEEDS, campSite, columnPosition, conditionBand, dateOf, dropFlock, effectivePace,
  foodDays, formatDate, newGame, orderHalt, orderMarch, pastureDensity, planRoute, setPace, speedFactor, step, takeFlock,
  type GameState, type LogEntry, type PaceId, type Site,
} from "./sim";
import { LABELS, cssVar, createMap, helmet, mix, type Layer } from "./ui/map";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const graph = SCENARIO.graph;
const fmt = (n: number) => Math.round(n).toLocaleString("en");
const stage = $("stage"), info = $("info"), menu = $("menu");

/** replaces an element's content only when it changed, so buttons inside stay clickable while the game runs */
function setHTML(el: HTMLElement, html: string): boolean {
  if (el.dataset.html === html) return false;
  el.dataset.html = html;
  el.innerHTML = html;
  return true;
}

let game: GameState = newGame(0);
let started = false;
let playing = false;
let speed: number = SPEEDS[0];
let selected: Site | null = null;
let selectedDesc: string | undefined;
let hovered: Site | null = null;

const map = createMap({
  container: stage,
  tooltip: $("tip"),
  graph,
  onSelectRegion: () => closePlace(),
  onSelectPass: p => {
    const site = graph.sites.find(s => s.id === p.id);
    if (site) selectSite(site, p.desc);
  },
  onSelectSite: s => selectSite(s),
  onHoverSite: s => { hovered = s; renderPreview(); },
});
const focusColumn = () => {
  const [lon, lat] = columnPosition(game.columns[0]);
  map.focus(lon - 2.4, lat - 1.9, lon + 2.4, lat + 1.9);
};
map.focus(111.4, 37.1, 116.6, 41.6);

// --- title screen, then the start card ---
$("play-game").onclick = () => $("title").classList.add("gone");

const flocks = $("flocks");
SCENARIO.flockOptions.forEach(n => {
  const b = document.createElement("button");
  b.textContent = n ? `${fmt(n)} sheep` : "None";
  b.setAttribute("aria-pressed", String(n === 0));
  b.onclick = () => {
    flocks.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    game = newGame(n);
    render();
  };
  flocks.append(b);
});
$("begin").onclick = () => {
  started = true;
  $("start").hidden = true;
  toast({ hour: 0, text: "Click a place on the map to march there." });
  render();
};

// --- time ---
const speeds = $("speeds");
SPEEDS.forEach(v => {
  const b = document.createElement("button");
  b.textContent = v + "×";
  b.dataset.speed = String(v);
  b.setAttribute("aria-label", `Speed ${v}`);
  b.onclick = () => { speed = v; setPlaying(true); };
  speeds.append(b);
});
function setPlaying(on: boolean) {
  playing = on && started && !game.over;
  render();
}
$("play").onclick = () => setPlaying(!playing);
document.addEventListener("keydown", e => {
  if (!started || e.target instanceof HTMLInputElement) return;
  if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
  const n = Number(e.key);
  if (n >= 1 && n <= SPEEDS.length) { speed = SPEEDS[n - 1]; setPlaying(true); }
  if (e.key === "Escape") { closePlace(); toggleMenu(false); }
});

// --- menu: layers, legend, journal ---
function toggleMenu(open: boolean = menu.hidden === true) {
  menu.hidden = !open;
  $("menu-btn").setAttribute("aria-expanded", String(open));
  if (open) closePlace();
  stage.classList.toggle("side-open", open || !info.hidden);
}
$("menu-btn").onclick = () => toggleMenu();

// --- orders ---
function march(id: string) {
  if (!started) return;
  orderMarch(game, 0, id);
  closePlace();
  setPlaying(true);
}

// --- place card ---
function selectSite(s: Site, desc?: string) {
  selected = s;
  selectedDesc = desc;
  map.selectSite(s.id);
  info.hidden = false;
  toggleMenu(false);
  stage.classList.add("side-open");
  render();
}
function closePlace() {
  selected = null;
  info.hidden = true;
  map.selectSite(null);
  stage.classList.toggle("side-open", !menu.hidden);
  renderPreview();
}

const KIND = { city: "Town", pass: "Mountain pass", junction: "Crossroads", pasture: "Pasture grounds" };
const days = (d: number) => (d < 1 ? "less than a day" : `about ${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`);

function renderPlace() {
  const s = selected;
  if (!s) return;
  const date = dateOf(game);
  const st = game.sites[s.id];
  const c = game.columns[0];
  const plan = planRoute(c, s.id);
  const here = c.at === s.id;
  const food = foodDays(c);
  let route = "";
  if (here) route = `<div class="route">${c.name}'s column is here.</div>`;
  else if (plan) {
    const short = food < plan.days;
    route = `<div class="route">${fmt(plan.km)} km, ${days(plan.days)} at the ${effectivePace(c)} pace.${short ? ` <b style="color:var(--bad)">Food lasts ${Math.floor(food)} days.</b>` : ""}</div>`;
  }
  const changed = setHTML(info, `<button class="close icon" aria-label="Close">✕</button>
    <span class="label">${KIND[s.kind]}</span><h2>${s.name}</h2>
    ${selectedDesc ? `<p class="note" style="margin-top:4px">${selectedDesc}</p>` : ""}
    <dl>
      <dt>Terrain</dt><dd>${LABELS.terrain[s.terrain]}</dd>
      <dt>Held by</dt><dd>${LABELS.political[s.control]}</dd>
      <dt>Grass</dt><dd>${grassText(pastureDensity(s, date.month, st))}${st.grazed > 1 ? ", partly grazed" : ""}</dd>
      <dt>Water</dt><dd>${s.water ? "Yes" : "None, a dry camp"}</dd>
      ${st.sheep > 0 ? `<dt>Flock</dt><dd>${fmt(st.sheep)} sheep left here</dd>` : ""}
    </dl>
    ${route}
    ${started && !here && plan ? `<button class="primary" id="go">March here</button>` : ""}`);
  if (changed) {
    info.querySelector<HTMLButtonElement>(".close")!.onclick = closePlace;
    info.querySelector<HTMLButtonElement>("#go")?.addEventListener("click", () => march(s.id));
  }
}

/** grass in words, with the number for those who want it */
function grassText(density: number) {
  const word = density >= 20 ? "Rich" : density >= 12 ? "Fair" : density >= 6 ? "Poor" : "Very poor";
  return `${word} (${density.toFixed(0)} t/km²)`;
}

// --- column panel ---
const level = (v: number, warn: number, bad: number) => (v <= bad ? "bad" : v <= warn ? "warn" : "ok");
function bar(label: string, value: number, cls: string, text: string) {
  return `<div class="bar"><span>${label}</span><i><b class="${cls}" style="width:${Math.max(2, Math.min(100, value))}%"></b></i><span>${text}</span></div>`;
}

const BAND = { fat: "fat", fit: "fit", thin: "thin", exhausted: "exhausted" };
/** the column panel can fold to one line, which matters on phones where it would cover half the map */
let folded = window.matchMedia("(max-width: 640px)").matches;
$("column").classList.toggle("collapsed", folded);
const PACE_HINT: Record<PaceId, string> = {
  grazing: "15 km a day, horses eat on the way",
  normal: "35 km a day, the everyday march",
  forced: "55 km a day for two or three days, then horses suffer",
};
function renderColumn() {
  const c = game.columns[0];
  const camp = campSite(c);
  const dest = c.route.at(-1) ?? c.leg?.to;
  const status = c.at
    ? (c.route.length && !c.halted ? `Leaving ${graph.site(c.at).name} for ${graph.site(dest!).name}` : `Camped at ${graph.site(c.at).name}`)
    : c.halted ? `Halted on the way to ${graph.site(c.leg!.to).name}` : `Marching to ${graph.site(dest!).name}`;
  const pace = effectivePace(c);
  const food = foodDays(c);
  const perMan = c.horses / Math.max(1, c.men);
  const density = pastureDensity(camp, dateOf(game).month, game.sites[camp.id]);
  const flockHere = c.at ? game.sites[c.at].sheep : 0;
  const changed = setHTML($("column"), `<button class="fold icon" aria-label="${folded ? "Show details" : "Hide details"}" aria-expanded="${!folded}">${folded ? "▴" : "▾"}</button>
    <h2>${c.name}</h2>
    <p class="status">${status}</p>
    <p class="compact">Condition ${c.condition.toFixed(0)} · fatigue ${c.fatigue.toFixed(0)} · food ${Math.floor(food)} days · ${fmt(c.horses)} horses</p>
    <div class="stats">
      <div><b>${fmt(c.men)}</b><span>men</span></div>
      <div><b>${fmt(c.horses)}</b><span>horses</span></div>
      <div><b>${fmt(c.sheep)}</b><span>sheep</span></div>
      <div><b>${perMan.toFixed(1)}</b><span>per man</span></div>
    </div>
    ${bar("Condition", c.condition, level(c.condition, 40, 20), BAND[conditionBand(c.condition)])}
    ${bar("Fatigue", c.fatigue, level(100 - c.fatigue, 40, 15), c.fatigue < 30 ? "rested" : c.fatigue < 60 ? "tired" : c.fatigue < 85 ? "worn" : "spent")}
    ${bar("Food", (food / 30) * 100, level(food, 7, 3), `${Math.floor(food)} days`)}
    ${bar("Grass", (density / 30) * 100, level(density, 12, 6), grassText(density).split(" (")[0].toLowerCase())}
    <div class="orders">
      <div class="seg" role="group" aria-label="Pace">
        ${(["grazing", "normal", "forced"] as const).map(p => `<button data-pace="${p}" aria-pressed="${p === pace}" ${c.sheep > 0 && p !== "grazing" ? "disabled" : ""}>${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}
      </div>
      <div class="seg">
        <button id="halt" ${c.halted || (!c.leg && !c.route.length) ? "disabled" : ""}>Halt</button>
        ${c.sheep > 0 ? `<button id="drop" ${c.at ? "" : "disabled"}>Leave flock</button>` : ""}
        ${flockHere > 0 ? `<button id="take">Take ${fmt(flockHere)} sheep</button>` : ""}
      </div>
    </div>
    <p class="hint">${c.sheep > 0 ? "The flock sets the pace. Leave it somewhere to march faster." : PACE_HINT[pace]}${speedFactor(c) < 1 ? `. Tired or thin horses: ${Math.round(PACES[pace].marchHours * PACES[pace].kmPerHour * speedFactor(c))} km a day.` : ""}</p>`);
  if (!changed) return;
  const col = $("column");
  col.querySelector<HTMLButtonElement>(".fold")!.onclick = () => { folded = !folded; col.classList.toggle("collapsed", folded); render(); };
  col.querySelectorAll<HTMLButtonElement>("[data-pace]").forEach(b => { b.onclick = () => { setPace(game, 0, b.dataset.pace as PaceId); render(); }; });
  col.querySelector<HTMLButtonElement>("#halt")?.addEventListener("click", () => { orderHalt(game, 0); render(); });
  col.querySelector<HTMLButtonElement>("#drop")?.addEventListener("click", () => { dropFlock(game, 0); render(); });
  col.querySelector<HTMLButtonElement>("#take")?.addEventListener("click", () => { takeFlock(game, 0); render(); });
}

// --- journal and notices ---
const shortDate = (hour: number) => { const d = dateOf({ ...game, hour }); return `${d.day} ${MONTH_NAMES[d.month].slice(0, 3)}`; };
let logSeen = 1;
function renderLog() {
  if (game.log.length === Number($("log").dataset.count)) return;
  $("log").dataset.count = String(game.log.length);
  $("log").innerHTML = game.log.slice().reverse().map(l => `<li class="${l.kind ?? ""}"><span>${shortDate(l.hour)}</span>${l.text}</li>`).join("");
  // new entries become notices; an arrival or an alert pauses the game so the player can react
  for (const l of game.log.slice(logSeen)) {
    toast(l);
    if ((l.kind === "arrival" || l.kind === "alert") && playing) playing = false;
  }
  logSeen = game.log.length;
}
function toast(l: LogEntry) {
  const box = $("toasts");
  const t = document.createElement("div");
  t.className = `toast ${l.kind ?? ""}`;
  t.textContent = l.text;
  box.append(t);
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, l.kind ? 6000 : 3500);
}

// --- map overlays ---
function routePoints(c = game.columns[0], sites: string[]) {
  const pts: [number, number][] = [columnPosition(c)];
  for (const id of sites) { const s = graph.site(id); pts.push([s.lon, s.lat]); }
  return pts;
}
function renderRoute() {
  const c = game.columns[0];
  if (c.halted || (!c.leg && !c.route.length)) { map.setRoute([]); return; }
  map.setRoute(routePoints(c, c.leg ? [c.leg.to, ...c.route] : c.route));
}
function renderPreview() {
  const target = hovered ?? selected;
  const c = game.columns[0];
  const plan = target && started ? planRoute(c, target.id) : null;
  map.setPreview(plan && plan.sites.length ? routePoints(c, plan.sites) : []);
  if (hovered && plan && plan.sites.length) $("tip").textContent = `${hovered.name} · ${days(plan.days)}`;
}

function render() {
  renderLog(); // first: a new arrival or alert pauses the game, and the rest must show that
  const d = dateOf(game);
  $("date").textContent = formatDate(d);
  $("clock-hour").textContent = game.over ? "The season is over" : `${String(d.hour).padStart(2, "0")}:00 · ${playing ? `${speed}× speed` : "paused"}`;
  $("play").textContent = playing ? "❚❚" : "▶";
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
  speeds.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(playing && Number(b.dataset.speed) === speed)));
  const [lon, lat] = columnPosition(game.columns[0]);
  map.placeColumn(lon, lat);
  renderRoute();
  renderColumn();
  renderPlace();
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
    while (acc >= MS_PER_HOUR && !game.over && playing) {
      acc -= MS_PER_HOUR;
      const before = game.log.length;
      step(game);
      stepped = true;
      // stop at once on an arrival or an alert, so the player sees it when it happens
      if (game.log.slice(before).some(l => l.kind === "arrival" || l.kind === "alert")) break;
    }
    if (stepped) {
      if (now - lastPanel > 200 || game.log.length !== logSeen) { lastPanel = now; render(); }
      else { const [lon, lat] = columnPosition(game.columns[0]); map.placeColumn(lon, lat); renderRoute(); }
    }
    if (game.over) setPlaying(false);
  } else acc = 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$("zin").onclick = () => map.zoom(1 / 1.4);
$("zout").onclick = () => map.zoom(1.4);
$("zreset").onclick = focusColumn;
document.querySelectorAll<HTMLButtonElement>("#layers button").forEach(b =>
  b.addEventListener("click", () => {
    const l = b.dataset.layer as Layer;
    document.querySelectorAll("#layers button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    map.setLayer(l);
    legend(l);
  }),
);
legend("pasture");
render();

function legend(layer: Layer) {
  const C = cssVar;
  const sw = (c: string) => `<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" fill="${c}"/></svg>`;
  $("leg-title").textContent = "Legend · " + ($("layers").querySelector(`[data-layer="${layer}"]`)?.textContent ?? "").toLowerCase();
  const symbols = `<dt><svg width="18" height="14" aria-hidden="true"><path d="M2,13Q5,9 9,2Q12,8 16,13" fill="${C("--paper")}" stroke="${C("--ink")}"/></svg></dt><dd>Mountains</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><circle cx="9" cy="7" r="5" fill="${C("--paper")}" stroke="${C("--ink")}"/><circle cx="9" cy="7" r="2" fill="${C("--label")}"/></svg></dt><dd>Capital</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><rect x="6" y="4" width="6" height="6" fill="${C("--paper")}" stroke="${C("--ink")}"/></svg></dt><dd>City</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M3,1Q8,7 3,13M15,1Q10,7 15,13" fill="none" stroke="${C("--road")}" stroke-width="2.2" stroke-linecap="round"/></svg></dt><dd>Pass</dd>
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
