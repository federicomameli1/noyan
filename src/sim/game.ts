// Game state and the hourly simulation step.
// The state is plain data (no classes, no references to the graph), so it can be saved as JSON.
// Rules and numbers: see constants.ts.

import { addHours, daysBetween, formatDate, type GameDate } from "./calendar";
import * as R from "./constants";
import { findPath, linkBetween, type Graph, type Site } from "./graph";
import { SCENARIO } from "./scenario";

export interface Leg {
  from: string;
  to: string;
  /** km already covered */
  done: number;
  km: number;
}

export interface Column {
  name: string;
  men: number;
  horses: number;
  sheep: number;
  /** personal rations left (dried milk, qurut, dried meat), in man-days */
  rations: number;
  /** 0-100, slow: fat on the horse */
  condition: number;
  /** 0-100, fast: tiredness recovered by resting */
  fatigue: number;
  pace: R.PaceId;
  /** the site where the column stands, or null while it is on a link */
  at: string | null;
  leg: Leg | null;
  /** sites still to reach after the current one or the current leg */
  route: string[];
  /** set by a halt order: the column stays where it is, even halfway along a link */
  halted: boolean;
  today: { marchHours: number; km: number };
  /** last values reported in the log, to report only changes */
  reported: { band: ConditionBand; foodDays: number; starving: boolean };
}

export interface SiteState {
  /** tonnes of grass grazed around the site and not yet grown back */
  grazed: number;
  /** sheep left here by a column */
  sheep: number;
}

export interface LogEntry {
  hour: number;
  text: string;
  /** entries the player should not miss: arrivals and alerts pause the game, warnings do not */
  kind?: "arrival" | "alert" | "warning";
}

export interface GameState {
  /** hours since the start of the scenario */
  hour: number;
  columns: Column[];
  sites: Record<string, SiteState>;
  log: LogEntry[];
  over: boolean;
}

export type ConditionBand = "fat" | "fit" | "thin" | "exhausted";
export const conditionBand = (c: number): ConditionBand => (c >= 70 ? "fat" : c >= 40 ? "fit" : c >= 20 ? "thin" : "exhausted");

const graph: Graph = SCENARIO.graph;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function newGame(sheep = 0): GameState {
  const c = SCENARIO.column;
  const col: Column = {
    name: c.name, men: c.men, horses: c.men * c.horsesPerMan, sheep, rations: c.men * c.rationsPerMan,
    condition: c.condition, fatigue: 0, pace: "normal", at: SCENARIO.base, leg: null, route: [], halted: false,
    today: { marchHours: 0, km: 0 }, reported: { band: conditionBand(c.condition), foodDays: 0, starving: false },
  };
  col.reported.foodDays = foodDays(col);
  const sites: Record<string, SiteState> = {};
  for (const s of graph.sites) sites[s.id] = { grazed: 0, sheep: 0 };
  return { hour: 0, columns: [col], sites, log: [{ hour: 0, text: `${c.name} is at ${graph.site(SCENARIO.base).name} with ${c.men.toLocaleString("en")} men.` }], over: false };
}

export const dateOf = (s: GameState): GameDate => addHours(SCENARIO.start, s.hour);
export const totalHours = () => daysBetween(SCENARIO.start, SCENARIO.end) * 24;

// --- derived values, also used by the interface ---

/** Pace actually used: a column with sheep cannot go faster than the flock. */
export const effectivePace = (c: Column): R.PaceId => (c.sheep > 0 ? "grazing" : c.pace);

/** Work of each horse compared with a horse ridden all day, given the remounts. */
function horseWork(c: Column): number {
  const n = c.men > 0 ? c.horses / c.men : 0;
  if (n <= 1) return 1;
  return 1 / n + ((n - 1) / n) * R.SPARE_HORSE_WORK;
}
const remountFactor = (c: Column) => horseWork(c) / (1 / 4 + (3 / 4) * R.SPARE_HORSE_WORK);

/** Speed multiplier from tiredness and thinness: 1 when fresh, down to 0.5. */
export function speedFactor(c: Column): number {
  const fromFatigue = c.fatigue > 60 ? 1 - (c.fatigue - 60) / 80 : 1;
  const fromCondition = c.condition < 40 ? 0.5 + (0.5 * c.condition) / 40 : 1;
  return Math.min(fromFatigue, fromCondition);
}

export function isMoving(c: Column): boolean {
  return !c.halted && (c.leg !== null || c.route.length > 0) && c.men > 0;
}

/** The site whose pasture the column uses: where it stands, or the nearer end of its leg. */
export function campSite(c: Column): Site {
  if (c.at) return graph.site(c.at);
  const l = c.leg!;
  return graph.site(l.done < l.km / 2 ? l.from : l.to);
}

/** Usable grass around a site now, tonnes per km². */
export function pastureDensity(site: Site, month: number, st: SiteState): number {
  const seasonal = R.PASTURE_DENSITY[site.terrain] * R.PASTURE_SEASON[site.terrain][month];
  return Math.max(0, seasonal - st.grazed / R.GRAZING_AREA_KM2);
}

/** Days of food left for the men, counting sheep but not horses. */
export const foodDays = (c: Column) => (c.men > 0 ? (c.rations + c.sheep * R.RATIONS_PER_SHEEP) / c.men : 0);

/** Position as (lon, lat), interpolated along the current leg. */
export function columnPosition(c: Column): [number, number] {
  if (!c.leg) { const s = graph.site(c.at!); return [s.lon, s.lat]; }
  const a = graph.site(c.leg.from), b = graph.site(c.leg.to), t = c.leg.done / c.leg.km;
  return [a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t];
}

// --- orders ---

export interface RoutePlan {
  /** true if a column halfway along a link turns back */
  turnBack: boolean;
  /** sites to reach in order, starting with the end of the current leg if on one */
  sites: string[];
  /** km left to march */
  km: number;
  /** days of marching at the column's current pace and state, roughly */
  days: number;
}

/** Fastest route for a column to a site, without changing anything. Null if there is none. */
export function planRoute(c: Column, dest: string): RoutePlan | null {
  let turnBack = false, sites: string[], km: number;
  if (c.at) {
    if (c.at === dest) return { turnBack, sites: [], km: 0, days: 0 };
    const p = findPath(graph, c.at, dest);
    if (!p) return null;
    sites = p.slice(1);
    km = routeKm(p);
  } else {
    // halfway along a link: go on, or turn back if that is shorter
    const l = c.leg!;
    const ahead = findPath(graph, l.to, dest), back = findPath(graph, l.from, dest);
    if (!ahead && !back) return null;
    const cost = (p: string[] | null, start: number) => (p ? start + routeKm(p) : Infinity);
    turnBack = cost(back, l.done) < cost(ahead, l.km - l.done);
    sites = turnBack ? back! : ahead!;
    km = cost(sites, turnBack ? l.done : l.km - l.done);
  }
  return { turnBack, sites, km, days: marchDays(c, turnBack, sites) };
}

function marchDays(c: Column, turnBack: boolean, sites: string[]): number {
  const pace = R.PACES[effectivePace(c)];
  const kmh = pace.kmPerHour * speedFactor(c);
  let hours = 0, from = c.at;
  if (c.leg) {
    const link = linkBetween(graph, c.leg.from, c.leg.to)!;
    hours += (turnBack ? c.leg.done : c.leg.km - c.leg.done) / (kmh * R.LINKS[link.kind].speed);
    from = turnBack ? c.leg.from : c.leg.to;
  }
  for (const to of sites) {
    if (to === from) continue;
    const link = linkBetween(graph, from!, to)!;
    hours += link.km / (kmh * R.LINKS[link.kind].speed);
    from = to;
  }
  return hours / pace.marchHours;
}

/** Sends a column to a site along the fastest route. Returns false if there is no route. */
export function orderMarch(s: GameState, ci: number, dest: string): boolean {
  const c = s.columns[ci];
  const plan = planRoute(c, dest);
  if (!plan) return false;
  if (plan.turnBack) {
    const l = c.leg!;
    c.leg = { from: l.to, to: l.from, done: l.km - l.done, km: l.km };
  }
  // the first site of the plan is where the current leg ends: the leg itself takes the column there
  c.route = c.leg ? plan.sites.slice(1) : plan.sites;
  c.halted = false;
  return true;
}

function routeKm(p: string[]): number {
  let km = 0;
  for (let i = 1; i < p.length; i++) km += linkBetween(graph, p[i - 1], p[i])!.km;
  return km;
}

export function orderHalt(s: GameState, ci: number) {
  const c = s.columns[ci];
  c.route = [];
  c.halted = true;
}

export function setPace(s: GameState, ci: number, pace: R.PaceId) {
  s.columns[ci].pace = pace;
}

/** Leaves the flock at the current site. Only possible when standing at a site. */
export function dropFlock(s: GameState, ci: number): boolean {
  const c = s.columns[ci];
  if (!c.at || c.sheep <= 0) return false;
  s.sites[c.at].sheep += c.sheep;
  log(s, `${c.name} leaves ${Math.round(c.sheep).toLocaleString("en")} sheep at ${graph.site(c.at).name}.`);
  c.sheep = 0;
  return true;
}

/** Takes the sheep left at the current site. */
export function takeFlock(s: GameState, ci: number): boolean {
  const c = s.columns[ci];
  if (!c.at || s.sites[c.at].sheep <= 0) return false;
  c.sheep += s.sites[c.at].sheep;
  s.sites[c.at].sheep = 0;
  log(s, `${c.name} takes the flock, now ${Math.round(c.sheep).toLocaleString("en")} sheep.`);
  return true;
}

// --- simulation ---

function log(s: GameState, text: string, kind?: LogEntry["kind"]) {
  s.log.push(kind ? { hour: s.hour, text, kind } : { hour: s.hour, text });
}

/** Advances the game by one hour. */
export function step(s: GameState) {
  if (s.over) return;
  const hourOfDay = dateOf(s).hour;
  for (const c of s.columns) stepColumn(s, c, hourOfDay);
  s.hour++;
  if (dateOf(s).hour === 0) endOfDay(s);
  if (s.hour >= totalHours()) {
    s.over = true;
    log(s, `The season is over: ${formatDate(dateOf(s))}.`);
  }
}

function stepColumn(s: GameState, c: Column, hourOfDay: number) {
  const pace = R.PACES[effectivePace(c)];
  const marching = isMoving(c) && hourOfDay >= R.MARCH_START_HOUR && hourOfDay < R.MARCH_START_HOUR + pace.marchHours;
  if (!marching) {
    c.fatigue = Math.max(0, c.fatigue - R.FATIGUE_RECOVERY * (0.5 + c.condition / 200));
    return;
  }
  let km = pace.kmPerHour * speedFactor(c);
  c.today.marchHours++;
  c.fatigue = Math.min(100, c.fatigue + pace.fatiguePerHour * remountFactor(c));
  while (km > 0) {
    if (!c.leg) {
      const next = c.route.shift();
      if (!next) break;
      c.leg = { from: c.at!, to: next, done: 0, km: linkBetween(graph, c.at!, next)!.km };
      c.at = null;
    }
    const link = linkBetween(graph, c.leg.from, c.leg.to)!;
    const speed = R.LINKS[link.kind].speed;
    const step = Math.min(km * speed, c.leg.km - c.leg.done);
    c.leg.done += step;
    c.today.km += step;
    km -= step / speed;
    if (c.leg.done >= c.leg.km - 1e-9) {
      c.at = c.leg.to;
      c.leg = null;
      if (c.route.length === 0) log(s, `${c.name} reaches ${graph.site(c.at).name}.`, "arrival");
    }
  }
}

function endOfDay(s: GameState) {
  const month = dateOf(s).month;
  const quality = R.PASTURE_QUALITY[month];
  for (const c of s.columns) {
    if (c.men <= 0) continue;
    const site = campSite(c);
    const st = s.sites[site.id];
    const pace = R.PACES[effectivePace(c)];

    // horses: grazing against need
    const need = R.HORSE_NEED_REST + R.HORSE_NEED_PER_KM * c.today.km * horseWork(c);
    const grazeHours = Math.min(R.MAX_GRAZE_HOURS, 24 - c.today.marchHours - R.CAMP_HOURS) + c.today.marchHours * pace.grazeWhileMarching;
    const density = pastureDensity(site, month, st);
    const eaten = ((R.GRAZE_MAX_KG_PER_HOUR * density) / (density + R.GRAZE_HALF_DENSITY)) * grazeHours;
    const ratio = (eaten * quality) / need;
    const delta = R.CONDITION_RATE * (ratio - 1);
    c.condition = clamp(c.condition + clamp(delta, -R.CONDITION_MAX_LOSS, R.CONDITION_MAX_GAIN), 0, 100);
    st.grazed += (c.horses * eaten + c.sheep * R.SHEEP_GRAZE_KG) / 1000;
    if (!site.water) {
      c.fatigue = Math.min(100, c.fatigue + R.DRY_CAMP_FATIGUE);
      c.condition = Math.max(0, c.condition - R.DRY_CAMP_CONDITION);
    }

    // horses: deaths
    let deaths = 0;
    if (c.condition < 10) deaths += R.DEATHS_STARVING;
    else if (c.condition < 20) deaths += R.DEATHS_THIN;
    if (c.fatigue > 90 && c.today.marchHours > 0) deaths += R.DEATHS_EXHAUSTED;
    const dead = c.horses * deaths;
    c.horses -= dead;

    // men: personal rations, then sheep, then horses
    let hunger = c.men;
    const fromRations = Math.min(c.rations, hunger);
    c.rations -= fromRations;
    hunger -= fromRations;
    const fromSheep = Math.min(c.sheep * R.RATIONS_PER_SHEEP, hunger);
    c.sheep -= fromSheep / R.RATIONS_PER_SHEEP;
    hunger -= fromSheep;
    let eatenHorses = 0;
    if (hunger > 0) {
      const perHorse = R.RATIONS_PER_HORSE * (0.5 + c.condition / 200);
      eatenHorses = Math.min(c.horses, hunger / perHorse);
      c.horses -= eatenHorses;
      hunger -= eatenHorses * perHorse;
    }
    const starving = hunger > 0.5;
    if (starving) c.men -= c.men * R.STARVATION_LOSS;

    report(s, c, Math.round(dead), Math.round(eatenHorses), starving);
    c.today = { marchHours: 0, km: 0 };
    if (c.horses < c.men && isMoving(c)) {
      orderHalt(s, s.columns.indexOf(c));
      log(s, `${c.name} has fewer horses than men and cannot march.`, "alert");
    }
  }
  if (month >= 3 && month <= 8) for (const st of Object.values(s.sites)) st.grazed *= 1 - R.REGROWTH_PER_DAY;
}

const BAND_TEXT: Record<ConditionBand, string> = { fat: "fat", fit: "fit", thin: "thin", exhausted: "exhausted" };

function report(s: GameState, c: Column, dead: number, eaten: number, starving: boolean) {
  const band = conditionBand(c.condition);
  if (band !== c.reported.band) {
    log(s, `${c.name}'s horses are now ${BAND_TEXT[band]}.`, band === "thin" || band === "exhausted" ? "alert" : undefined);
    c.reported.band = band;
  }
  const days = foodDays(c);
  if (c.reported.foodDays > 5 && days <= 5 && days > 0) log(s, `${c.name} has food for 5 days or less.`, "alert");
  c.reported.foodDays = days;
  if (eaten > 0) log(s, `${c.name}'s men eat ${eaten} horses.`, "warning");
  if (dead >= 10) log(s, `${dead} of ${c.name}'s horses die.`, "warning");
  if (starving !== c.reported.starving) {
    log(s, starving ? `${c.name}'s men are starving.` : `${c.name}'s men have food again.`, starving ? "alert" : undefined);
    c.reported.starving = starving;
  }
}
