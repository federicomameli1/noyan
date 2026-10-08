import "./style.css";
import {
  MONTH_NAMES, PACES, SCENARIO, SECONDS_PER_DAY, SPEEDS, campSite, columnPosition, conditionBand, dateOf, dropFlock, effectivePace,
  canBesiege, foodDays, forecast, formatDate, newGame, orderHalt, orderMarch, orderSiege, orderStorm, pastureDensity, planRoute, setPace, siegeDays,
  speedFactor, spoils, step, stormCost, stormFails, takeFlock, describeSave, makeSave, readSave, saveFileName,
  describeOrder, describeSighting, isRelieved, sightingDate, sizeBand, type JinArmy,
  type CityState, type Column, type SaveFile, type ConditionBand, type ConditionChange, type Forecast, type GameState, type LogEntry, type PaceId, type Site,
} from "./sim";
import * as saves from "./ui/saves";
import { LABELS, TARGET_TEXT, cssVar, createMap, helmet, jinBanner, mix, targetSymbol, type ArmyMark, type Layer } from "./ui/map";

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
/** the column the player gives orders to */
let active = 0;
const col = () => game.columns[active];

const map = createMap({
  container: stage,
  tooltip: $("tip"),
  graph,
  targets: Object.fromEntries(Object.entries(SCENARIO.cities).map(([id, c]) => [id, c.type])),
  onSelectRegion: () => closePlace(),
  onSelectPass: p => {
    const site = graph.sites.find(s => s.id === p.id);
    if (site) selectSite(site, p.desc);
  },
  onSelectSite: s => selectSite(s),
  onHoverSite: s => { hovered = s; renderPreview(); },
  onSelectColumn: i => selectColumn(i),
});
const focusColumn = () => {
  const [lon, lat] = columnPosition(col());
  map.focus(lon - 2.4, lat - 1.9, lon + 2.4, lat + 1.9);
};
map.focus(111.4, 37.1, 116.6, 41.6);

// --- title screen, then the start card ---
function leaveTitle() {
  $("title").classList.add("gone");
  document.body.classList.remove("at-title");
}
$("play-game").onclick = leaveTitle;
// a game left halfway can be picked up from the title screen
saves.latest().then(save => {
  if (!save || save.game.over || started) return;
  const cont = $<HTMLButtonElement>("continue");
  cont.hidden = false;
  cont.classList.add("primary");
  $("play-game").classList.remove("primary");
  $("continue-note").hidden = false;
  $("continue-note").textContent = `Saved game: ${describeSave(save)}.`;
  cont.onclick = () => { leaveTitle(); loadGame(save); };
});

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
// map layers work before the campaign starts too
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains("at-title")) return;
  const b = document.querySelector<HTMLButtonElement>(`#layers [data-key="${e.key.toLowerCase()}"]`);
  if (b) b.click();
});

// --- menu: layers, legend, journal ---
function toggleMenu(open: boolean = menu.hidden === true) {
  menu.hidden = !open;
  $("menu-btn").setAttribute("aria-expanded", String(open));
  if (open) closePlace();
  stage.classList.toggle("side-open", open || !info.hidden);
}
$("menu-btn").onclick = () => toggleMenu();

// --- saves: an automatic one every game day, a manual one, and files ---
const loadBtn = $<HTMLButtonElement>("load");
saves.load("manual").then(save => { loadBtn.disabled = !save; });
function note(text: string) { $("save-note").textContent = text; }

function loadGame(save: SaveFile) {
  game = save.game;
  active = save.active;
  started = true;
  forecasts.clear();
  savedDay = Math.floor(game.hour / 24);
  logSeen = game.log.length;
  delete $("log").dataset.count;
  $("start").hidden = true;
  $("end").hidden = true;
  closePlace();
  setPlaying(false);
  focusColumn();
  toast({ hour: game.hour, text: `Game loaded: ${describeSave(save)}. Press space to go on.` });
}
const confirmLoad = () => !started || game.over || confirm("Load the saved game? The campaign in progress is lost since its last save.");

$("save").onclick = async () => {
  if (!started) return note("Start the campaign first.");
  const ok = await saves.store("manual", makeSave(game, active));
  loadBtn.disabled = !ok && loadBtn.disabled;
  note(ok ? `Saved: ${formatDate(dateOf(game))}.` : "This browser refused to save. Use Export to file instead.");
};
loadBtn.onclick = async () => {
  const save = await saves.load("manual");
  if (!save) return note("There is no saved game, or it can no longer be read.");
  if (confirmLoad()) { loadGame(save); toggleMenu(false); }
};
$("export").onclick = () => {
  if (!started) return note("Start the campaign first.");
  const save = makeSave(game, active);
  saves.exportFile(save, saveFileName(save));
};
const importFile = $<HTMLInputElement>("import-file");
$("import").onclick = () => importFile.click();
importFile.onchange = async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  try {
    const save = readSave(await file.text());
    if (confirmLoad()) { loadGame(save); toggleMenu(false); }
  } catch (e) {
    note(e instanceof Error ? e.message : "This file cannot be read.");
  }
};

/** the last game day saved automatically */
let savedDay = 0;
function autosave() {
  if (started) saves.store("auto", makeSave(game, active));
}
// also on leaving the page, so closing the tab loses at most the current day
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autosave(); });

// --- orders ---
function march(id: string) {
  if (!started) return;
  orderMarch(game, active, id);
  closePlace();
  setPlaying(true);
}

function storm() {
  const c = col();
  if (!c.siege) return;
  const name = graph.site(c.siege).name;
  if (!confirm(`Storm ${name} now? You will lose about ${fmt(stormCost(game.cities[c.siege]))} men.`)) return;
  orderStorm(game, active);
  render();
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
const TYPE_NAME = { town: "Jin town", walled: "Jin walled city", fortress: "Jin fortress" };
const TYPE_NOTE = {
  town: "Earthen walls and a small garrison: it falls fast. Its granaries feed men and horses.",
  walled: "Brick walls: a long siege. Its workshops give engineers, who halve the time of later sieges.",
  fortress: "Holds the pass: no column can march through until it falls. Starved out, part of the garrison joins you; stormed, none do.",
};
/** what taking a city would give now, in words */
function spoilsText(c: Column, city: CityState) {
  const got = spoils(c, city, false);
  const parts = [`${Math.round(got.rations / Math.max(1, c.men))} days of food`];
  if (got.grain >= 1) parts.push(`${Math.round(got.grain)} days of grain`);
  if (got.engineers) parts.push("engineers");
  if (got.recruits) parts.push(`${fmt(got.recruits)} men if starved out`);
  if (got.opensPass) parts.push("an open pass");
  return parts.join(", ");
}
const days = (d: number) => (d < 1 ? "less than a day" : `about ${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`);

// --- forecasts: the game played forward on a copy, so the player sees the collapse before it comes ---
const BAND_RANK: Record<ConditionBand, number> = { exhausted: 0, thin: 1, fit: 2, fat: 3 };
const bandLevel = (b: ConditionBand) => (b === "exhausted" ? "bad" : b === "thin" ? "warn" : "ok");
const forecasts = new Map<string, Forecast | null>();
/** forecast for the first column, cached until the game moves on or the orders change */
function cachedForecast(dest: string | null, maxDays: number) {
  const c = col();
  const key = [game.hour, active, dest, maxDays, c.pace, c.halted, c.at, c.leg?.to, c.route.join(), c.siege, c.sheep].join("|");
  if (!forecasts.has(key)) {
    if (forecasts.size > 50) forecasts.clear();
    forecasts.set(key, forecast(game, active, dest, maxDays));
  }
  return forecasts.get(key)!;
}
/** forecast of a march to a site, long enough to arrive */
const marchForecast = (id: string, planDays: number) => cachedForecast(id, Math.min(90, Math.ceil(planDays * 1.5) + 3));

/** horses, food and losses when the column gets there, in one sentence */
function arrivalText(f: Forecast) {
  const c = col();
  const e = f.end;
  const lost = c.horses - e.horses;
  const parts = [`horses <b class="t-${bandLevel(e.band)}">${e.band}</b>${e.fatigue >= 85 ? ` but <b class="t-bad">spent</b>` : e.fatigue >= 60 ? ` but <b class="t-warn">worn</b>` : ""}`];
  parts.push(e.starving ? `<b class="t-bad">men starving</b>` : `food for ${Math.floor(e.foodDays)} days`);
  if (lost >= 0.01 * c.horses) parts.push(`<b class="t-warn">about ${fmt(lost)} horses lost</b>`);
  return parts.join(", ");
}

const OUTLOOK_DAYS = 20;
/** what the next days hold if the orders stay as they are */
function outlookText() {
  const c = col();
  const f = cachedForecast(null, OUTLOOK_DAYS);
  if (!f) return "";
  const now = conditionBand(c.condition);
  const parts: string[] = [];
  if (f.arrival !== null) {
    const dest = graph.site(c.leg && !c.route.length ? c.leg.to : c.route.at(-1)!).name;
    parts.push(`Reaches ${dest} in ${days(f.arrival)}: ${arrivalText(f)}.`);
  }
  const worse = f.days.find(d => BAND_RANK[d.band] < BAND_RANK[now] && d.band !== "fit");
  const better = f.days.find(d => BAND_RANK[d.band] > BAND_RANK[now]);
  if (worse && (f.arrival === null || worse.day <= f.arrival + 1)) parts.push(`Horses <b class="t-${bandLevel(worse.band)}">${worse.band}</b> in ${days(worse.day)} at this pace.`);
  else if (better && f.arrival === null) parts.push(`Horses ${better.band} again in ${days(better.day)}.`);
  const dying = f.days.find((d, i) => (i ? f.days[i - 1].horses : c.horses) - d.horses >= 0.005 * c.horses);
  if (dying) parts.push(`<b class="t-warn">Horses die from ${dying.day <= 1 ? "today" : `day ${Math.round(dying.day)}`}.</b>`);
  const hungry = f.days.find(d => d.starving);
  if (hungry && !c.reported.starving) parts.push(`<b class="t-bad">Food runs out in ${days(hungry.day)}.</b>`);
  if (!parts.length) parts.push(`Next ${OUTLOOK_DAYS} days: horses stay ${now}${hungry ? "" : ", food lasts"}.`);
  return parts.join(" ");
}

function renderPlace() {
  const s = selected;
  if (!s) return;
  const date = dateOf(game);
  const st = game.sites[s.id];
  const c = col();
  const plan = planRoute(game, c, s.id);
  const here = c.at === s.id;
  const food = foodDays(c);
  const city = game.cities[s.id];
  let route = "";
  if (here && city && !city.taken && isRelieved(game, s.id)) {
    route = `<div class="route"><b class="t-bad">A Jin army holds the city and keeps it fed: the siege makes no headway.</b> Storm the walls, or march away.</div>`;
  } else if (here && city && !city.taken) {
    route = c.siege === s.id
      ? `<div class="route">Besieged: ${Math.floor(city.progress)}%, falls in about ${siegeDays(game, c, s.id)} days if the siege goes on.</div>`
      : `<div class="route">A siege would take about ${siegeDays(game, c, s.id)} days${c.engineers ? " with your engineers" : ""}.</div>`;
  } else if (here) route = `<div class="route">${c.name}'s column is here.</div>`;
  else if (plan) {
    // the forecast knows that tired horses slow down, so its arrival beats the plan's estimate
    const f = marchForecast(s.id, plan.days);
    const time = f?.arrival ?? plan.days;
    const short = food < time;
    const ahead = f ? `<br>${f.arrival === null ? `After ${Math.round(f.end.day)} days, still on the way` : "On arrival"}: ${arrivalText(f)}.` : "";
    route = `<div class="route">${fmt(plan.km)} km, ${days(time)} at the ${effectivePace(c)} pace.${short ? ` <b class="t-bad">Food lasts ${Math.floor(food)} days.</b>` : ""}${ahead}</div>`;
  } else route = `<div class="route">No open road: a Jin fortress or army holds the way.</div>`;
  const changed = setHTML(info, `<button class="close icon" aria-label="Close">✕</button>
    <span class="label">${city ? (city.taken ? `${TYPE_NAME[city.type]}, taken` : TYPE_NAME[city.type]) : KIND[s.kind]}</span><h2>${s.name}</h2>
    ${selectedDesc ? `<p class="note" style="margin-top:4px">${selectedDesc}</p>` : ""}
    ${city && !city.taken ? `<p class="note" style="margin-top:4px">${TYPE_NOTE[city.type]}</p>` : ""}
    ${s.kind === "city" && !city ? `<p class="note" style="margin-top:4px">No Jin garrison here: there is nothing to besiege.</p>` : ""}
    <dl>
      <dt>Terrain</dt><dd>${LABELS.terrain[s.terrain]}</dd>
      <dt>Held by</dt><dd>${city?.taken ? "Mongols, taken" : LABELS.political[s.control]}</dd>
      ${city && !city.taken ? `<dt>Garrison</dt><dd>${fmt(city.garrison)} men</dd>
      <dt>Walls</dt><dd>${city.walls >= 4 ? "Very strong" : city.walls >= 3 ? "Strong" : city.walls >= 2 ? "Fair" : "Weak"}</dd>
      <dt>Stores</dt><dd>${Math.ceil(city.stores)} days</dd>
      <dt>Spoils</dt><dd>${spoilsText(c, city)}</dd>` : ""}
      <dt>Grass</dt><dd>${grassText(pastureDensity(s, date.month, st))}${st.grazed > 1 ? ", partly grazed" : ""}</dd>
      <dt>Water</dt><dd>${s.water ? "Yes" : "None, a dry camp"}</dd>
      ${st.sheep > 0 ? `<dt>Flock</dt><dd>${fmt(st.sheep)} sheep left here</dd>` : ""}
      ${armiesAt(s.id).map(a => `<dt>Jin army</dt><dd>${armyText(a)}</dd>`).join("")}
    </dl>
    ${route}
    ${started && !here && plan ? `<button class="primary" id="go">March here</button>` : ""}
    ${started && here && canBesiege(game, c) ? `<button class="primary" id="siege">Lay siege</button>` : ""}
    ${started && here && c.siege === s.id && city ? (stormFails(c, city) ? `<p class="note" style="margin-top:8px">Too few men to storm the walls yet: about ${fmt(stormCost(city))} would fall.</p>` : `<button class="primary" id="storm">Storm now, losing about ${fmt(stormCost(city))} men</button>`) : ""}`);
  if (changed) {
    info.querySelector<HTMLButtonElement>(".close")!.onclick = closePlace;
    info.querySelector<HTMLButtonElement>("#go")?.addEventListener("click", () => march(s.id));
    info.querySelector<HTMLButtonElement>("#siege")?.addEventListener("click", () => { orderSiege(game, active); setPlaying(true); });
    info.querySelector<HTMLButtonElement>("#storm")?.addEventListener("click", storm);
  }
}

/** grass in words, with the number for those who want it */
function grassText(density: number) {
  const word = density >= 20 ? "Rich" : density >= 12 ? "Fair" : density >= 6 ? "Poor" : "Very poor";
  return `${word} (${density.toFixed(0)} t/km²)`;
}

// --- column panel ---
const level = (v: number, warn: number, bad: number) => (v <= bad ? "bad" : v <= warn ? "warn" : "ok");
function bar(label: string, value: number, cls: string, text: string, open = `<div class="bar">`, close = "</div>") {
  return `${open}<span>${label}</span><i><b class="${cls}" style="width:${Math.max(2, Math.min(100, value))}%"></b></i><span>${text}</span>${close}`;
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
// --- why the condition changes: yesterday's change split into its causes ---
let showWhy = false;
const signed = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);
const SEASON_WORD = ["Winter", "Winter", "Early spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Late summer", "Autumn", "Autumn", "Winter"];
function whyText(d: ConditionChange) {
  const month = dateOf(game).month;
  const rows: [string, number][] = [
    [`Grass here, ${grassText(d.density).toLowerCase()}`, d.grass],
    [`${SEASON_WORD[month]} grass, ${Math.round(d.quality * 100)}% as good`, d.season],
    [`March of ${fmt(d.km)} km`, d.march],
    ["Captured grain", d.grain],
    ["No water at the camp", d.dry],
    [d.cap < 0 ? (d.total >= 0 ? "Horses put on flesh slowly" : "Already at their best") : "Horses lose at most 3 a day", d.cap],
  ];
  const shown = rows.filter(([, v]) => Math.abs(v) >= 0.05);
  return `<dl class="why-list">${shown.map(([k, v]) => `<dt>${k}</dt><dd class="t-${v < 0 ? "bad" : "ok"}">${signed(v)}</dd>`).join("")}
    <dt><b>Yesterday</b></dt><dd><b>${signed(d.total)}</b></dd></dl>`;
}

function renderColumn() {
  const c = col();
  const camp = campSite(c);
  const dest = c.route.at(-1) ?? c.leg?.to;
  const besieged = c.siege ? game.cities[c.siege] : null;
  const status = c.siege ? `Besieging ${graph.site(c.siege).name}` : c.waiting ? `Halted: a Jin army bars the road at ${graph.site(c.waiting).name}` : c.at
    ? (c.route.length && !c.halted ? `Leaving ${graph.site(c.at).name} for ${graph.site(dest!).name}` : `Camped at ${graph.site(c.at).name}`)
    : c.halted ? `Halted on the way to ${graph.site(c.leg!.to).name}` : `Marching to ${graph.site(dest!).name}`;
  const pace = effectivePace(c);
  const food = foodDays(c);
  const perMan = c.horses / Math.max(1, c.men);
  const density = pastureDensity(camp, dateOf(game).month, game.sites[camp.id]);
  const flockHere = c.at ? game.sites[c.at].sheep : 0;
  const changed = setHTML($("column"), `<button class="fold icon" aria-label="${folded ? "Show details" : "Hide details"}" aria-expanded="${!folded}">${folded ? "▴" : "▾"}</button>
    ${game.columns.length > 1 ? `<div class="seg tabs" role="group" aria-label="Column">${game.columns.map((x, i) => `<button data-col="${i}" aria-pressed="${i === active}">${x.name}</button>`).join("")}</div>` : ""}
    <h2>${c.name}</h2>
    <p class="status">${status}</p>
    <p class="compact">${besieged ? `Siege ${Math.floor(besieged.progress)}% · ` : ""}condition ${c.condition.toFixed(0)} · fatigue ${c.fatigue.toFixed(0)} · food ${Math.floor(food)} days · ${fmt(c.horses)} horses</p>
    <div class="stats">
      <div><b>${fmt(c.men)}</b><span>men</span></div>
      <div><b>${fmt(c.horses)}</b><span>horses</span></div>
      <div><b>${fmt(c.sheep)}</b><span>sheep</span></div>
      <div><b>${perMan.toFixed(1)}</b><span>per man</span></div>
    </div>
    ${bar("Condition", c.condition, level(c.condition, 40, 20), `${BAND[conditionBand(c.condition)]} ${showWhy ? "▴" : "▾"}`,
      `<button class="bar why" aria-expanded="${showWhy}" title="Why the condition changes">`, "</button>")}
    ${!showWhy ? "" : c.lastDay ? whyText(c.lastDay) : `<p class="why-list">The horses gain or lose condition each night, from the grass they found and the road they covered.</p>`}
    ${bar("Fatigue", c.fatigue, level(100 - c.fatigue, 40, 15), c.fatigue < 30 ? "rested" : c.fatigue < 60 ? "tired" : c.fatigue < 85 ? "worn" : "spent")}
    ${bar("Food", (food / 30) * 100, level(food, 7, 3), `${Math.floor(food)} days`)}
    ${bar("Grass", (density / 30) * 100, level(density, 12, 6), grassText(density).split(" (")[0].toLowerCase())}
    ${besieged ? bar("Siege", besieged.progress, isRelieved(game, c.siege!) ? "bad" : "ok", isRelieved(game, c.siege!) ? "stalled" : `${siegeDays(game, c, c.siege!)} days`) : ""}
    ${c.engineers || c.grain > 0 ? `<p class="note">${[c.engineers ? "Engineers with the column" : "", c.grain > 0 ? `grain for ${Math.ceil(c.grain)} days` : ""].filter(Boolean).join(" · ")}</p>` : ""}
    <div class="orders">
      <div class="seg" role="group" aria-label="Pace">
        ${(["grazing", "normal", "forced"] as const).map(p => `<button data-pace="${p}" aria-pressed="${p === pace}" ${c.sheep > 0 && p !== "grazing" ? "disabled" : ""}>${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}
      </div>
      <div class="seg">
        ${canBesiege(game, c) ? `<button id="siege" class="primary">Lay siege</button>` : ""}
        ${besieged ? `<button id="storm" ${stormFails(c, besieged) ? "disabled title=\"Too few men to storm yet\"" : ""}>Storm, −${fmt(stormCost(besieged))} men</button>` : `<button id="halt" ${c.halted || (!c.leg && !c.route.length) ? "disabled" : ""}>Halt</button>`}
        ${c.sheep > 0 ? `<button id="drop" ${c.at ? "" : "disabled"}>Leave flock</button>` : ""}
        ${flockHere > 0 ? `<button id="take">Take ${fmt(flockHere)} sheep</button>` : ""}
      </div>
    </div>
    <p class="outlook">${outlookText()}</p>
    <p class="hint">${c.sheep > 0 ? "The flock sets the pace. Leave it somewhere to march faster." : PACE_HINT[pace]}${speedFactor(c) < 1 ? `. Tired or thin horses: ${Math.round(PACES[pace].marchHours * PACES[pace].kmPerHour * speedFactor(c))} km a day.` : ""}</p>`);
  if (!changed) return;
  const panel = $("column");
  panel.querySelector<HTMLButtonElement>(".fold")!.onclick = () => { folded = !folded; panel.classList.toggle("collapsed", folded); render(); };
  panel.querySelector<HTMLButtonElement>(".why")!.onclick = () => { showWhy = !showWhy; render(); };
  panel.querySelectorAll<HTMLButtonElement>("[data-col]").forEach(b => { b.onclick = () => selectColumn(Number(b.dataset.col)); });
  panel.querySelectorAll<HTMLButtonElement>("[data-pace]").forEach(b => { b.onclick = () => { setPace(game, active, b.dataset.pace as PaceId); render(); }; });
  panel.querySelector<HTMLButtonElement>("#halt")?.addEventListener("click", () => { orderHalt(game, active); render(); });
  panel.querySelector<HTMLButtonElement>("#siege")?.addEventListener("click", () => { orderSiege(game, active); setPlaying(true); });
  panel.querySelector<HTMLButtonElement>("#storm")?.addEventListener("click", storm);
  panel.querySelector<HTMLButtonElement>("#drop")?.addEventListener("click", () => { dropFlock(game, active); render(); });
  panel.querySelector<HTMLButtonElement>("#take")?.addEventListener("click", () => { takeFlock(game, active); render(); });
}

// --- journal and notices ---
const shortDate = (hour: number) => { const d = dateOf({ ...game, hour }); return `${d.day} ${MONTH_NAMES[d.month].slice(0, 3)}`; };
let logSeen = 1;
function renderLog() {
  if (game.log.length === Number($("log").dataset.count)) return;
  $("log").dataset.count = String(game.log.length);
  $("log").innerHTML = game.log.slice().reverse().map(l => `<li class="${l.kind ?? ""}"><span>${shortDate(l.hour)}</span>${l.text}</li>`).join("");
  // new entries become notices; an arrival or an alert pauses the game so the player can react
  let arrived = false;
  for (const l of game.log.slice(logSeen)) {
    toast(l);
    if ((l.kind === "arrival" || l.kind === "alert") && playing) playing = false;
    if (l.kind === "arrival") arrived = true;
  }
  logSeen = game.log.length;
  // reaching a Jin town opens its card, where the siege starts
  const c = col();
  if (arrived && c.at && canBesiege(game, c) && selected?.id !== c.at) selectSite(graph.site(c.at));
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
function routePoints(c: Column, sites: string[]) {
  const pts: [number, number][] = [columnPosition(c)];
  for (const id of sites) { const s = graph.site(id); pts.push([s.lon, s.lat]); }
  return pts;
}
function renderRoute() {
  const c = col();
  if (c.halted || (!c.leg && !c.route.length)) { map.setRoute([]); return; }
  map.setRoute(routePoints(c, c.leg ? [c.leg.to, ...c.route] : c.route));
}
function renderPreview() {
  const target = hovered ?? selected;
  const c = col();
  const plan = target && started ? planRoute(game, c, target.id) : null;
  map.setPreview(plan && plan.sites.length ? routePoints(c, plan.sites) : []);
  if (hovered && plan && plan.sites.length) {
    const f = marchForecast(hovered.id, plan.days);
    $("tip").textContent = `${hovered.name} · ${days(f?.arrival ?? plan.days)}${f ? ` · horses ${f.end.band}${f.end.fatigue >= 85 ? " and spent" : ""} on arrival` : ""}`;
  }
}

function render() {
  renderLog(); // first: a new arrival or alert pauses the game, and the rest must show that
  const d = dateOf(game);
  $("date").textContent = formatDate(d);
  if (game.over && $("end").hidden) showEnd();
  $("clock-hour").textContent = game.over ? "The campaign is over" : `${String(d.hour).padStart(2, "0")}:00 · ${playing ? `${speed}× speed` : "paused"}`;
  $("play").textContent = playing ? "❚❚" : "▶";
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
  speeds.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(playing && Number(b.dataset.speed) === speed)));
  renderColumns();
  renderArmies();
  map.setTaken(Object.keys(game.cities).filter(id => game.cities[id].taken));
  renderRoute();
  renderColumn();
  renderPlace();
}

function renderColumns() {
  map.setColumns(game.columns.map((c, i) => {
    const [lon, lat] = columnPosition(c);
    return { name: c.name, lon, lat, condition: c.condition, level: bandLevel(conditionBand(c.condition)), active: i === active };
  }));
}

// --- Jin armies, as far as the scouts know them ---
/** Armies the scouts place at a site: seen there now, or last seen there. */
const armiesAt = (id: string) => game.jin.filter(a => a.seen?.site === id);
/** What the player knows of an army, in one line. */
function armyText(a: JinArmy) {
  const v = a.seen!;
  const now = a.sight > 0;
  const what = describeSighting(v, a.name);
  const when = now ? "" : ` Last seen ${formatDate(sightingDate(game, v))}.`;
  const doing = v.level === 3 ? `, ${describeOrder(v)}` : "";
  return `${what[0].toUpperCase() + what.slice(1)}${doing}.${when}`;
}
function renderArmies() {
  const marks: ArmyMark[] = [];
  for (const a of game.jin) {
    const v = a.seen;
    if (!v) continue;
    const at = graph.site(v.site);
    const men = v.foot + v.horse;
    const label = v.level === 1 ? `${sizeBand(men)} army?` : v.level === 2 ? `~${fmt(Math.max(1000, Math.round(men / 1000) * 1000))}` : fmt(men);
    const stale = a.sight === 0;
    marks.push({
      lon: v.level === 1 ? at.lon : v.lon, lat: v.level === 1 ? at.lat : v.lat, level: v.level, stale,
      label: stale ? `${label} · ${shortDate(v.hour)}` : label, title: armyText(a),
    });
  }
  map.setArmies(marks);
}

function selectColumn(i: number) {
  if (i === active || !game.columns[i]) return;
  active = i;
  render();
}

// --- end of the game ---
function showEnd() {
  const men = game.columns.reduce((n, c) => n + c.men, 0), horses = game.columns.reduce((n, c) => n + c.horses, 0);
  const sent = SCENARIO.reinforcements.slice(0, game.arrived).map(r => r.column);
  const menAtStart = [SCENARIO.column, ...sent].reduce((n, c) => n + c.men, 0);
  const horsesAtStart = [SCENARIO.column, ...sent].reduce((n, c) => n + c.men * c.horsesPerMan, 0);
  const taken = Object.entries(game.cities).filter(([, x]) => x.taken).map(([id]) => graph.site(id).name);
  const win = game.result === "victory";
  $("end-title").textContent = win ? "Taiyuan has fallen" : "The campaign has failed";
  setHTML($("end-body"), `<p>${game.log.at(-1)?.text ?? ""}</p><dl>
    <dt>Date</dt><dd>${formatDate(dateOf(game))}</dd>
    <dt>Men</dt><dd>${fmt(men)} of ${fmt(menAtStart)}</dd>
    <dt>Horses</dt><dd>${fmt(horses)} of ${fmt(horsesAtStart)}</dd>
    <dt>Towns taken</dt><dd>${taken.length ? taken.join(", ") : "none"}</dd></dl>`);
  $("end").hidden = false;
}
$("again").onclick = () => location.reload();

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
    if (stepped && Math.floor(game.hour / 24) !== savedDay) { savedDay = Math.floor(game.hour / 24); autosave(); }
    if (stepped) {
      if (now - lastPanel > 200 || game.log.length !== logSeen) { lastPanel = now; render(); }
      else { renderColumns(); renderArmies(); renderRoute(); }
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
  $("leg-title").textContent = "Legend · " + ($("layers").querySelector(`[data-layer="${layer}"]`)?.firstChild?.textContent ?? "").toLowerCase();
  const target = (type: keyof typeof TYPE_NAME, taken = false) =>
    `<svg width="18" height="18" viewBox="-10 -12 20 22" aria-hidden="true"><g class="target${taken ? " taken" : ""}">${targetSymbol(type)}</g></svg>`;
  const symbols = `<dt>${target("town")}</dt><dd>${TARGET_TEXT.town}</dd>
    <dt>${target("walled")}</dt><dd>${TARGET_TEXT.walled}</dd>
    <dt>${target("fortress")}</dt><dd>${TARGET_TEXT.fortress}</dd>
    <dt>${target("walled", true)}</dt><dd>Taken by the Mongols</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><rect x="6" y="4" width="6" height="6" fill="${C("--paper")}" stroke="${C("--ink")}"/></svg></dt><dd>City with no Jin garrison</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><circle cx="9" cy="7" r="5" fill="${C("--paper")}" stroke="${C("--ink")}"/><circle cx="9" cy="7" r="2" fill="${C("--label")}"/></svg></dt><dd>Capital</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M3,1Q8,7 3,13M15,1Q10,7 15,13" fill="none" stroke="${C("--road")}" stroke-width="2.2" stroke-linecap="round"/></svg></dt><dd>Pass</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M1,7H17" stroke="${C("--road")}" stroke-width="1.5" stroke-opacity=".7"/></svg></dt><dd>Road</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M1,7H17" stroke="${C("--ink")}" stroke-opacity=".6" stroke-dasharray="5 4"/></svg></dt><dd>Track</dd>
    <dt><svg width="18" height="14" aria-hidden="true"><path d="M1,7H17" stroke="${C("--ink")}" stroke-opacity=".7" stroke-dasharray="1 4" stroke-linecap="round"/></svg></dt><dd>Mountain path</dd>
    <dt><svg width="18" height="18" viewBox="-18 -26 36 36" aria-hidden="true">${helmet()}</svg></dt><dd>Muqali's column</dd>
    <dt><svg width="18" height="18" viewBox="-12 -16 24 28" aria-hidden="true"><g class="army-mark">${jinBanner()}</g></svg></dt><dd>Jin army: the closer your scouts, the more you know. Faded where it was last seen</dd>`;
  let items = "";
  if (layer === "pasture") {
    items = `<dt>${sw(mix(C("--p-low"), C("--p-high"), 0.15))}</dt><dd>Poor pasture</dd><dt>${sw(mix(C("--p-low"), C("--p-high"), 0.5))}</dt><dd>Average</dd><dt>${sw(C("--p-high"))}</dt><dd>Rich pasture</dd>`;
  } else if (layer !== "map") {
    const prefix = { terrain: "--t-", political: "--pol-", diplomatic: "--dip-" }[layer];
    items = Object.entries(LABELS[layer]).map(([k, v]) => `<dt>${sw(C(prefix + k))}</dt><dd>${v}</dd>`).join("");
  }
  $("legend").innerHTML = items + symbols;
}
