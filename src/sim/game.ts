// Game state and the hourly simulation step.
// The state is plain data (no classes, no references to the graph), so it can be saved as JSON.
// Rules and numbers: see constants.ts.

import { addHours, daysBetween, formatDate, type GameDate } from "./calendar";
import * as R from "./constants";
import { findPath, linkBetween, type Graph, type Site } from "./graph";
import { armyAt, cityFalls, isRelieved, jinDecide, knownArmyAt, newJin, stepJin, type JinArmy } from "./jin";
import { SCENARIO, type ColumnSpec } from "./scenario";

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
  /** the site the column last left, to know which side of a fortress it stands on */
  cameFrom: string | null;
  /** sites still to reach after the current one or the current leg */
  route: string[];
  /** set by a halt order: the column stays where it is, even halfway along a link */
  halted: boolean;
  /** a Jin army bars the road at this site: the column waits in front of it */
  waiting: string | null;
  today: { marchHours: number; km: number };
  /** the city being besieged, if any */
  siege: string | null;
  /** engineers taken from a captured city: sieges go faster */
  engineers: boolean;
  /** days of grain for the horses, from captured granaries */
  grain: number;
  /** last values reported in the log, to report only changes */
  reported: { band: ConditionBand; foodDays: number; starving: boolean };
  /** why the horses' condition changed on the last day, or null before the first night */
  lastDay: ConditionChange | null;
}

/**
 * The day's change in condition split into its causes. Each term is the difference it made
 * compared with the line before, so the terms add up to the total.
 */
export interface ConditionChange {
  /** resting all day on this grass at its summer best */
  grass: number;
  /** what the season takes away from the grass (0 in summer) */
  season: number;
  /** marching: less time to graze, and more effort */
  march: number;
  /** captured grain makes up for poor grass */
  grain: number;
  /** horses gain flesh slowly, lose it fast, and stay within 0-100: the part of the change these limits take away */
  cap: number;
  /** a camp without water */
  dry: number;
  total: number;
  km: number;
  density: number;
  quality: number;
}

export interface SiteState {
  /** tonnes of grass grazed around the site and not yet grown back */
  grazed: number;
  /** sheep left here by a column */
  sheep: number;
}

export interface CityState {
  type: R.CityType;
  garrison: number;
  walls: number;
  /** days of food left inside the walls */
  stores: number;
  storesAtStart: number;
  /** days in a row a column has besieged it: a relief army may set out */
  besiegedDays: number;
  /** 0-100: at 100 the city falls */
  progress: number;
  taken: boolean;
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
  /** Jin armies in the field */
  jin: JinArmy[];
  sites: Record<string, SiteState>;
  cities: Record<string, CityState>;
  log: LogEntry[];
  /** reinforcements from the scenario already arrived */
  arrived: number;
  over: boolean;
  result: "victory" | "defeat" | null;
}

export type ConditionBand = "fat" | "fit" | "thin" | "exhausted";
export const conditionBand = (c: number): ConditionBand => (c >= 70 ? "fat" : c >= 40 ? "fit" : c >= 20 ? "thin" : "exhausted");

const graph: Graph = SCENARIO.graph;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function newColumn(c: ColumnSpec, at: string, sheep = 0): Column {
  const col: Column = {
    name: c.name, men: c.men, horses: c.men * c.horsesPerMan, sheep, rations: c.men * c.rationsPerMan,
    condition: c.condition, fatigue: 0, pace: "normal", at, cameFrom: null, leg: null, route: [], halted: false, waiting: null,
    today: { marchHours: 0, km: 0 }, siege: null, engineers: false, grain: 0, reported: { band: conditionBand(c.condition), foodDays: 0, starving: false }, lastDay: null,
  };
  col.reported.foodDays = foodDays(col);
  return col;
}

export function newGame(sheep = 0): GameState {
  const c = SCENARIO.column;
  const col = newColumn(c, SCENARIO.base, sheep);
  const sites: Record<string, SiteState> = {};
  for (const s of graph.sites) sites[s.id] = { grazed: 0, sheep: 0 };
  const cities: Record<string, CityState> = {};
  for (const [id, x] of Object.entries(SCENARIO.cities)) {
    cities[id] = { type: x.type, garrison: x.garrison, walls: x.walls ?? R.CITY_TYPES[x.type].walls, stores: x.stores, storesAtStart: x.stores, besiegedDays: 0, progress: 0, taken: false };
  }
  return {
    hour: 0, columns: [col], jin: newJin(), sites, cities, arrived: 0, over: false, result: null,
    log: [{ hour: 0, text: `${c.name} is at ${graph.site(SCENARIO.base).name} with ${c.men.toLocaleString("en")} men. Take ${graph.site(SCENARIO.objective).name} before spring. Spies say the Jin are gathering an army at Pingyang, in the south.` }],
  };
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
export function columnPosition(c: Pick<Column, "at" | "leg">): [number, number] {
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

/** True for a Jin fortress that still holds: no column can march through it. */
export const isClosed = (s: GameState, id: string) => {
  const city = s.cities[id];
  return !!city && !city.taken && R.CITY_TYPES[city.type].blocks;
};

/** Fastest path from a site to another. At a fortress that still holds, the column can only go back the way it came. */
function pathFrom(s: GameState, site: string, cameFrom: string | null, dest: string): string[] | null {
  // a Jin army bars the road through its place too, but the column only knows of the ones its scouts see
  const closed = (id: string) => isClosed(s, id) || knownArmyAt(s, id);
  if (site !== dest && cameFrom && closed(site)) {
    const back = findPath(graph, cameFrom, dest, closed);
    return back && [site, ...back];
  }
  return findPath(graph, site, dest, closed);
}

/** Fastest route for a column to a site, without changing anything. Null if there is none. */
export function planRoute(s: GameState, c: Column, dest: string): RoutePlan | null {
  let turnBack = false, sites: string[], km: number;
  if (c.at) {
    if (c.at === dest) return { turnBack, sites: [], km: 0, days: 0 };
    const p = pathFrom(s, c.at, c.cameFrom, dest);
    if (!p) return null;
    sites = p.slice(1);
    km = routeKm(p);
  } else {
    // halfway along a link: go on, or turn back if that is shorter
    const l = c.leg!;
    const ahead = pathFrom(s, l.to, l.from, dest), back = pathFrom(s, l.from, l.to, dest);
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
  const plan = planRoute(s, c, dest);
  if (!plan) return false;
  if (c.siege && dest !== c.siege) liftSiege(s, c);
  if (plan.turnBack) {
    const l = c.leg!;
    c.leg = { from: l.to, to: l.from, done: l.km - l.done, km: l.km };
  }
  // the first site of the plan is where the current leg ends: the leg itself takes the column there
  c.route = c.leg ? plan.sites.slice(1) : plan.sites;
  c.halted = false;
  return true;
}

// --- forecasts ---

export interface ForecastDay {
  /** days from now, at the end of that day */
  day: number;
  condition: number;
  band: ConditionBand;
  fatigue: number;
  horses: number;
  foodDays: number;
  starving: boolean;
}

export interface Forecast {
  /** the column at the end of each day */
  days: ForecastDay[];
  /** days until the column reaches the end of its route, or null if it does not within the horizon or has nowhere to go */
  arrival: number | null;
  /** the column at the end of the arrival day, or at the horizon */
  end: ForecastDay;
}

/**
 * Plays the game forward on a copy, without touching the real one: what happens to a column
 * if it keeps its orders, or if it marches to `dest`. Stops at the end of the arrival day,
 * after `maxDays`, or when the copy of the game ends. Null if there is no route to `dest`.
 */
export function forecast(s: GameState, ci: number, dest: string | null, maxDays: number): Forecast | null {
  const copy: GameState = JSON.parse(JSON.stringify({ ...s, log: [] }));
  const c = copy.columns[ci];
  if (dest !== null && c.at !== dest && !orderMarch(copy, ci, dest)) return null;
  const snapshot = (): ForecastDay => ({
    day: (copy.hour - s.hour) / 24, condition: c.condition, band: conditionBand(c.condition), fatigue: c.fatigue,
    horses: c.horses, foodDays: foodDays(c), starving: c.reported.starving,
  });
  const days: ForecastDay[] = [];
  let arrivalHour: number | null = null;
  const going = isMoving(c);
  for (let h = 0; h < maxDays * 24 && !copy.over; h++) {
    step(copy);
    if (going && arrivalHour === null && !c.halted && !c.leg && !c.route.length) arrivalHour = copy.hour;
    if (dateOf(copy).hour === 0) {
      days.push(snapshot());
      if (arrivalHour !== null) break;
    }
  }
  return {
    days,
    arrival: arrivalHour === null ? null : (arrivalHour - s.hour) / 24,
    end: days.at(-1) ?? snapshot(),
  };
}

function routeKm(p: string[]): number {
  let km = 0;
  for (let i = 1; i < p.length; i++) km += linkBetween(graph, p[i - 1], p[i])!.km;
  return km;
}

// --- sieges ---

/** Siege progress a day for this column against this city. */
export function siegeRate(c: Column, city: CityState): number {
  return (R.SIEGE_RATE * (c.men / city.garrison)) / city.walls * (c.engineers ? R.ENGINEER_FACTOR : 1);
}

/** Days until the city falls if the siege goes on as now: by progress or by hunger, whichever comes first. */
/** Days until the city falls if this column besieges it, together with the other columns already there. */
export function siegeDays(s: GameState, c: Column, id: string): number {
  const city = s.cities[id];
  if (isRelieved(s, id)) return Infinity;
  const rate = s.columns.reduce((r, o) => r + (o !== c && o.siege === id ? siegeRate(o, city) : 0), siegeRate(c, city));
  return Math.min(Math.ceil((100 - city.progress) / rate), Math.ceil(city.stores));
}

/** Men a storm would cost now. */
export const stormCost = (city: CityState) => Math.round(city.garrison * city.walls * (1 - city.progress / 100) * R.STORM_COST);

/** Can this column besiege the city where it stands? */
export const canBesiege = (s: GameState, c: Column) => !!c.at && !!s.cities[c.at] && !s.cities[c.at].taken && c.siege !== c.at;

export function orderSiege(s: GameState, ci: number): boolean {
  const c = s.columns[ci];
  if (!canBesiege(s, c)) return false;
  c.siege = c.at;
  c.route = [];
  log(s, `${c.name} lays siege to ${graph.site(c.at!).name}.`);
  return true;
}

function liftSiege(s: GameState, c: Column) {
  log(s, `${c.name} lifts the siege of ${graph.site(c.siege!).name}.`);
  c.siege = null;
}

/** True if a storm now would leave the column too weak to go on, so it fails. */
export const stormFails = (c: Column, city: CityState) => c.men - stormCost(city) < R.DEFEAT_MEN;

/** Takes the besieged city by storm, at once, paying in men. Fails if too few men would be left. */
export function orderStorm(s: GameState, ci: number): boolean {
  const c = s.columns[ci];
  if (!c.siege) return false;
  const lost = Math.min(c.men, stormCost(s.cities[c.siege]));
  c.men -= lost;
  if (c.men < R.DEFEAT_MEN) {
    log(s, `${c.name} storms ${graph.site(c.siege).name}, loses ${lost.toLocaleString("en")} men and is thrown back.`, "alert");
  } else {
    log(s, `${c.name} storms ${graph.site(c.siege).name} and loses ${lost.toLocaleString("en")} men.`, "warning");
    capture(s, c, c.siege, true);
  }
  checkEnd(s);
  return true;
}

/** What taking a city gives, by its type and the state of its stores. Also used by the interface. */
export function spoils(c: Column, city: CityState, stormed: boolean) {
  const rules = R.CITY_TYPES[city.type];
  const full = city.stores / city.storesAtStart;
  return {
    rations: Math.max(0, Math.min(full * city.storesAtStart * city.garrison, c.men * R.MAX_RATION_DAYS - c.rations)),
    grain: rules.grainDays * full,
    engineers: rules.engineers && !c.engineers,
    recruits: stormed ? 0 : Math.round(city.garrison * rules.recruits),
    opensPass: rules.blocks,
  };
}

function capture(s: GameState, c: Column, id: string, stormed = false) {
  const city = s.cities[id];
  const got = spoils(c, city, stormed);
  city.taken = true;
  city.stores = 0;
  cityFalls(s, id);
  for (const o of s.columns) if (o.siege === id) o.siege = null;
  c.rations += got.rations;
  c.grain = Math.max(c.grain, got.grain);
  c.men += got.recruits;
  const gains = [`${Math.round(got.rations / Math.max(1, c.men))} days of food`];
  if (got.grain >= 1) gains.push(`${Math.round(got.grain)} days of grain for the horses`);
  if (got.engineers) { c.engineers = true; gains.push("engineers for the next sieges"); }
  if (got.recruits) gains.push(`${got.recruits.toLocaleString("en")} men from the garrison, on foot`);
  const opened = got.opensPass ? " The road through the pass is open." : "";
  log(s, `${graph.site(id).name} falls. ${c.name} gains ${gains.join(", ")}.${opened}`, "arrival");
  if (id === SCENARIO.objective) {
    s.result = "victory";
    s.over = true;
    log(s, `Victory: ${graph.site(id).name} is taken on ${formatDate(dateOf(s))}.`, "arrival");
  }
}

function checkEnd(s: GameState) {
  if (s.over) return;
  const men = s.columns.reduce((n, c) => n + c.men, 0);
  if (men < R.DEFEAT_MEN) {
    s.result = "defeat";
    s.over = true;
    log(s, `Defeat: the army has fewer than ${R.DEFEAT_MEN.toLocaleString("en")} men and can no longer campaign.`, "alert");
  } else if (s.hour >= totalHours()) {
    s.result = "defeat";
    s.over = true;
    log(s, `Defeat: spring has come and ${graph.site(SCENARIO.objective).name} still stands.`, "alert");
  }
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

export function log(s: GameState, text: string, kind?: LogEntry["kind"]) {
  s.log.push(kind ? { hour: s.hour, text, kind } : { hour: s.hour, text });
}

/** Advances the game by one hour. */
export function step(s: GameState) {
  if (s.over) return;
  const hourOfDay = dateOf(s).hour;
  for (const c of s.columns) stepColumn(s, c, hourOfDay);
  stepJin(s, hourOfDay);
  s.hour++;
  if (dateOf(s).hour === 0) endOfDay(s);
  const next = SCENARIO.reinforcements[s.arrived];
  if (next && s.hour >= daysBetween(SCENARIO.start, next.date) * 24) {
    s.columns.push(newColumn(next.column, next.at));
    s.arrived++;
    log(s, next.message, "arrival");
  }
  checkEnd(s);
}

/** Anything that moves along the graph: a column or a Jin army. */
export interface Mover {
  at: string | null;
  leg: Leg | null;
  cameFrom: string | null;
  route: string[];
}

/**
 * Moves along the route by `km` (on a road; slower links take more of it). Stops at a site when
 * `canEnter` refuses the next one. Calls `onArrive` at each site reached. Returns the km covered.
 */
export function advance(m: Mover, km: number, canEnter: (next: string, last: boolean) => boolean, onArrive: (site: string) => void): number {
  let covered = 0;
  while (km > 0) {
    if (!m.leg) {
      const next = m.route[0];
      if (!next || !canEnter(next, m.route.length === 1)) break;
      m.route.shift();
      m.leg = { from: m.at!, to: next, done: 0, km: linkBetween(graph, m.at!, next)!.km };
      m.at = null;
    }
    const speed = R.LINKS[linkBetween(graph, m.leg.from, m.leg.to)!.kind].speed;
    const step = Math.min(km * speed, m.leg.km - m.leg.done);
    m.leg.done += step;
    covered += step;
    km -= step / speed;
    if (m.leg.done >= m.leg.km - 1e-9) {
      m.at = m.leg.to;
      m.cameFrom = m.leg.from;
      m.leg = null;
      onArrive(m.at);
    }
  }
  return covered;
}

/** The site where a Jin army bars the column's road, if any. The column may still march to it, not through it. */
export function barredAt(s: GameState, c: Column): string | null {
  if (c.leg || c.route.length < 2) return null;
  return armyAt(s, c.route[0]) ? c.route[0] : null;
}

function stepColumn(s: GameState, c: Column, hourOfDay: number) {
  const pace = R.PACES[effectivePace(c)];
  const barred = isMoving(c) ? barredAt(s, c) : null;
  if (barred !== c.waiting) {
    if (barred) log(s, `${c.name} halts: a Jin army bars the road at ${graph.site(barred).name}.`, "alert");
    c.waiting = barred;
  }
  const marching = !barred && isMoving(c) && hourOfDay >= R.MARCH_START_HOUR && hourOfDay < R.MARCH_START_HOUR + pace.marchHours;
  if (!marching) {
    c.fatigue = Math.max(0, c.fatigue - R.FATIGUE_RECOVERY * (0.5 + c.condition / 200));
    return;
  }
  c.today.marchHours++;
  c.fatigue = Math.min(100, c.fatigue + pace.fatiguePerHour * remountFactor(c));
  c.today.km += advance(c, pace.kmPerHour * speedFactor(c), (next, last) => last || !armyAt(s, next), site => {
    if (c.route.length === 0) log(s, `${c.name} reaches ${graph.site(site).name}.`, "arrival");
  });
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
    const perHour = (R.GRAZE_MAX_KG_PER_HOUR * density) / (density + R.GRAZE_HALF_DENSITY);
    const eaten = perHour * grazeHours;
    const change = (ratio: number) => R.CONDITION_RATE * (ratio - 1);
    // the same day without marching, and without the season, tells what each of them costs
    const restEaten = perHour * Math.min(R.MAX_GRAZE_HOURS, 24 - R.CAMP_HOURS);
    const grass = change(restEaten / R.HORSE_NEED_REST);
    const seasonal = change((restEaten * quality) / R.HORSE_NEED_REST);
    let ratio = (eaten * quality) / need;
    const marched = change(ratio);
    if (c.grain > 0) {
      // captured grain: the horses are fed whatever the pasture
      ratio = Math.max(ratio, 1.5);
      c.grain = Math.max(0, c.grain - 1);
    }
    const delta = change(ratio);
    const before = c.condition;
    c.condition = clamp(c.condition + clamp(delta, -R.CONDITION_MAX_LOSS, R.CONDITION_MAX_GAIN), 0, 100);
    st.grazed += (c.horses * eaten + c.sheep * R.SHEEP_GRAZE_KG) / 1000;
    if (!site.water) {
      c.fatigue = Math.min(100, c.fatigue + R.DRY_CAMP_FATIGUE);
      c.condition = Math.max(0, c.condition - R.DRY_CAMP_CONDITION);
    }
    // the limit takes whatever the other terms do not explain: daily caps, and condition kept within 0-100
    const dry = site.water ? 0 : -R.DRY_CAMP_CONDITION, total = c.condition - before;
    c.lastDay = {
      grass, season: seasonal - grass, march: marched - seasonal, grain: delta - marched, dry, cap: total - delta - dry, total,
      km: c.today.km, density, quality,
    };

    // horses: deaths
    let deaths = 0;
    if (c.condition < 10) deaths += R.DEATHS_STARVING;
    else if (c.condition < 20) deaths += R.DEATHS_THIN;
    if (c.fatigue > 90 && c.today.marchHours > 0) deaths += R.DEATHS_EXHAUSTED;
    const dead = c.horses * deaths;
    c.horses -= dead;

    // siege: progress and the city's hunger
    if (c.siege && !isRelieved(s, c.siege)) {
      const city = s.cities[c.siege];
      city.progress = Math.min(100, city.progress + siegeRate(c, city));
      // the city eats once a day, however many columns surround it
      if (s.columns.find(o => o.siege === c.siege) === c) city.stores = Math.max(0, city.stores - 1);
      if (city.progress >= 100 || city.stores <= 0) capture(s, c, c.siege);
      if (s.over) return;
    }

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
  for (const [id, city] of Object.entries(s.cities)) city.besiegedDays = s.columns.some(c => c.siege === id) ? city.besiegedDays + 1 : 0;
  jinDecide(s);
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
