// Jin armies in the field (layer 1): they march, relieve besieged cities and raid flocks left behind.
// There are no battles yet: a field army bars the road through the place where it stands, and a
// column stops in front of it. Horsemen keep away from columns instead. Their rules are simple on purpose, so the player can read what they will do.
// What the Mongols know of them depends on distance: the closer the scouts, the more they see.

import * as R from "./constants";
import { distanceKm, findPath, type Site } from "./graph";
import { advance, columnPosition, conditionBand, dateOf, log, type GameState, type Leg } from "./game";
import { SCENARIO, type JinArmySpec } from "./scenario";

const graph = SCENARIO.graph;

/** hold: stays where it is · relieve: marches to a besieged city · raid: goes after a flock · return: back home · withdraw: away from a column */
export type JinOrder = "hold" | "relieve" | "raid" | "return" | "withdraw";

/** What the scouts saw of an army, the last time they saw it. Level: see `sightLevel`. */
export interface Sighting {
  hour: number;
  level: 1 | 2 | 3;
  lon: number;
  lat: number;
  /** the place nearest to where it was seen */
  site: string;
  foot: number;
  horse: number;
  order: JinOrder;
  target: string | null;
}

export interface JinArmy {
  name: string;
  kind: JinArmySpec["kind"];
  foot: number;
  horse: number;
  quality: number;
  morale: number;
  kmPerDay: number;
  home: string;
  at: string | null;
  leg: Leg | null;
  cameFrom: string | null;
  route: string[];
  order: JinOrder;
  target: string | null;
  /** inside a city it came to relieve: the siege makes no headway while it is there */
  inCity: boolean;
  /** what the scouts see of it now: 0 nothing, 1 an army and its size band, 2 its place and size, 3 everything */
  sight: number;
  /** the last sighting, kept when the army goes out of sight */
  seen: Sighting | null;
  /** highest level already reported in the log, back to 0 after a day out of sight */
  reported: number;
}

export function newJin(): JinArmy[] {
  return SCENARIO.jin.map(j => ({
    name: j.name, kind: j.kind, foot: j.foot, horse: j.horse, quality: j.quality, morale: j.morale, kmPerDay: j.kmPerDay, home: j.home,
    at: j.home, leg: null, cameFrom: null, route: [], order: "hold", target: null, inCity: false, sight: 0, seen: null, reported: 0,
  }));
}

export const armyMen = (a: { foot: number; horse: number }) => a.foot + a.horse;

/** Size band, as scouts far away would put it. */
export function sizeBand(men: number): "small" | "medium" | "large" {
  return men <= R.ARMY_SIZE.small ? "small" : men <= R.ARMY_SIZE.medium ? "medium" : "large";
}

/** Position as (lon, lat), interpolated along the current leg. Same as for a column. */
export const armyPosition = (a: JinArmy) => columnPosition(a);

/** The Jin field army standing at a site, if any (not one on a link). Horsemen do not bar roads: they get out of the way. */
export const armyAt = (s: GameState, site: string) => s.jin.find(a => a.at === site && a.kind === "field" && armyMen(a) > 0);

/** True if a Jin army inside this city keeps it fed: the siege makes no headway. */
export const isRelieved = (s: GameState, city: string) => s.jin.some(a => a.inCity && a.at === city);

/** An army the player knows is standing at this site now: seen well enough to place it exactly. */
export const knownArmyAt = (s: GameState, site: string) => !!armyAt(s, site) && armyAt(s, site)!.sight >= 2;

/** Site nearest to a point. */
function nearestSite(lon: number, lat: number): Site {
  let best = graph.sites[0], d = Infinity;
  for (const x of graph.sites) {
    const k = distanceKm(lon, lat, x.lon, x.lat);
    if (k < d) { d = k; best = x; }
  }
  return best;
}

/** What the scouts of all columns see of this army now, 0-3. */
export function sightLevel(s: GameState, a: JinArmy): number {
  const [lon, lat] = armyPosition(a);
  let level = 0;
  for (const c of s.columns) {
    if (c.men <= 0) continue;
    const [x, y] = columnPosition(c);
    const reach = conditionBand(c.condition) === "exhausted" ? R.SIGHT_EXHAUSTED : 1;
    const km = distanceKm(lon, lat, x, y) / reach;
    level = Math.max(level, km <= R.SIGHT_KM.full ? 3 : km <= R.SIGHT_KM.size ? 2 : km <= R.SIGHT_KM.presence ? 1 : 0);
  }
  return level;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en");
const roundThousand = (n: number) => Math.max(1000, Math.round(n / 1000) * 1000);

/** What the scouts know, in a few words, by the level of the sighting. Also used by the interface. */
export function describeSighting(v: Sighting, name: string): string {
  const men = v.foot + v.horse;
  if (v.level === 1) return `a ${sizeBand(men)} Jin army`;
  const mostly = v.horse > v.foot ? "mostly horse" : "mostly foot";
  if (v.level === 2) return `a Jin army of about ${fmt(roundThousand(men))} men, ${mostly}`;
  const parts = [v.foot ? `${fmt(v.foot)} foot` : "", v.horse ? `${fmt(v.horse)} horse` : ""].filter(Boolean).join(" and ");
  return `the ${name}, ${parts}`;
}

/** What the army is doing, in words, once it is seen closely. */
export function describeOrder(v: Sighting): string {
  const to = v.target ? graph.site(v.target).name : "";
  switch (v.order) {
    case "hold": return "holding its ground";
    case "relieve": return `marching to relieve ${to}`;
    case "raid": return `riding for the flock at ${to}`;
    case "return": return `going back to ${to}`;
    case "withdraw": return `falling back to ${to}`;
  }
}

/** Updates what the scouts see, and reports what is new in the log. */
function updateSightings(s: GameState) {
  for (const a of s.jin) {
    if (armyMen(a) <= 0) continue;
    a.sight = sightLevel(s, a);
    if (!a.sight) {
      if (a.seen && s.hour - a.seen.hour >= 24) a.reported = 0;
      continue;
    }
    const [lon, lat] = armyPosition(a);
    const site = nearestSite(lon, lat).id;
    a.seen = { hour: s.hour, level: a.sight as 1 | 2 | 3, lon, lat, site, foot: a.foot, horse: a.horse, order: a.order, target: a.target };
    if (a.sight > a.reported) {
      const where = graph.site(site).name;
      const what = describeSighting(a.seen, a.name);
      if (a.reported === 0) log(s, `Scouts report ${what} near ${where}.`, "alert");
      else if (a.sight === 3) log(s, `Scouts count ${what}, ${describeOrder(a.seen)}.`);
      else log(s, `Scouts see ${what}, at ${where}.`);
      a.reported = a.sight;
    }
  }
}

/** A column standing at a site: Jin armies do not march through it. */
const columnAt = (s: GameState, site: string) => s.columns.some(c => c.at === site && c.men > 0);

/** Sends an army to a site. If it is halfway along a link it first ends the link. False if there is no way. */
function go(s: GameState, a: JinArmy, dest: string, order: JinOrder): boolean {
  const from = a.at ?? a.leg!.to;
  a.order = order;
  a.target = dest;
  if (from === dest) { a.route = []; return true; }
  const path = findPath(graph, from, dest, id => columnAt(s, id));
  if (!path) { a.route = []; a.order = "hold"; a.target = null; return false; }
  a.route = path.slice(1);
  return true;
}

/** Can the army march on into `next`? Not where a column stands, unless that is where a field army is going. */
function canEnter(s: GameState, a: JinArmy, next: string, last: boolean): boolean {
  if (!columnAt(s, next)) return true;
  return last && a.kind === "field" && a.order === "relieve";
}

/** Moves the armies one hour, then updates what the scouts see. Called by `step` after the columns. */
export function stepJin(s: GameState, hourOfDay: number) {
  const marching = hourOfDay >= R.MARCH_START_HOUR && hourOfDay < R.MARCH_START_HOUR + R.JIN_MARCH_HOURS;
  if (marching) {
    for (const a of s.jin) {
      if (armyMen(a) <= 0 || (!a.leg && !a.route.length)) continue;
      advance(a, a.kmPerDay / R.JIN_MARCH_HOURS, (next, last) => canEnter(s, a, next, last), site => {
        if (!a.route.length) arrive(s, a, site);
      });
    }
  }
  updateSightings(s);
}

/** An army reaches the end of its route. */
function arrive(s: GameState, a: JinArmy, site: string) {
  if (a.order === "relieve" && site === a.target) {
    const city = s.cities[site];
    if (!city || city.taken) return;
    a.inCity = true;
    a.order = "hold";
    city.stores += R.RELIEF_STORES;
    const watched = s.columns.some(c => c.siege === site) || a.sight > 0;
    if (watched) log(s, `A Jin army of ${fmt(armyMen(a))} men reaches ${graph.site(site).name}. While it holds the city the siege can make no headway: storm the walls, or march away.`, "alert");
  } else if (a.order === "raid" && site === a.target) {
    const st = s.sites[site];
    if (st.sheep > 0 && !columnAt(s, site)) {
      log(s, `Jin horsemen drive off the ${fmt(st.sheep)} sheep left at ${graph.site(site).name}.`, "alert");
      st.sheep = 0;
    }
    go(s, a, home(s, a), "return");
  }
}

/** Jin towns still holding, where an army can shelter, and the army's own home. */
function refuges(s: GameState, a: JinArmy): string[] {
  const towns = Object.entries(s.cities).filter(([, c]) => !c.taken && c.type !== "fortress").map(([id]) => id);
  const spec = SCENARIO.jin.map(j => j.home);
  return [...new Set([...towns, ...spec, a.home])].filter(id => !s.cities[id]?.taken);
}

/** Where the army goes back to: its home, or the nearest Jin town if its home has fallen. */
function home(s: GameState, a: JinArmy): string {
  if (!s.cities[a.home]?.taken) return a.home;
  return nearestByRoad(s, a, refuges(s, a)) ?? a.home;
}

/** km by road from the army to a site, or Infinity if it cannot get there. */
function roadKm(s: GameState, a: JinArmy, dest: string): number {
  const from = a.at ?? a.leg!.to;
  const path = findPath(graph, from, dest, id => columnAt(s, id));
  if (!path) return Infinity;
  let km = a.leg ? a.leg.km - a.leg.done : 0;
  for (let i = 1; i < path.length; i++) km += graph.neighbours(path[i - 1]).find(n => n.to === path[i])!.link.km;
  return km;
}

function nearestByRoad(s: GameState, a: JinArmy, ids: string[]): string | null {
  let best: string | null = null, d = Infinity;
  for (const id of ids) {
    const k = roadKm(s, a, id);
    if (k < d) { d = k; best = id; }
  }
  return best;
}

/** km from an army (or a site) to the nearest column. */
function nearestColumnKm(s: GameState, lon: number, lat: number): number {
  let d = Infinity;
  for (const c of s.columns) {
    if (c.men <= 0) continue;
    const [x, y] = columnPosition(c);
    d = Math.min(d, distanceKm(lon, lat, x, y));
  }
  return d;
}

/** Flocks left with no column to guard them, that Jin horsemen here would hear of. */
function knownFlocks(s: GameState, a: JinArmy): string[] {
  const [lon, lat] = armyPosition(a);
  const towns = Object.entries(s.cities).filter(([, c]) => !c.taken).map(([id]) => graph.site(id));
  return Object.entries(s.sites).filter(([id, st]) => {
    if (st.sheep <= 0 || columnAt(s, id)) return false;
    const site = graph.site(id);
    const near = (x: number, y: number) => distanceKm(site.lon, site.lat, x, y) <= R.JIN_FLOCK_SIGHT_KM;
    return near(lon, lat) || towns.some(t => near(t.lon, t.lat));
  }).map(([id]) => id);
}

/** Once a day, at midnight: each army looks at what it knows and chooses what to do. */
export function jinDecide(s: GameState) {
  for (const a of s.jin) {
    if (armyMen(a) <= 0) continue;
    if (a.kind === "field") decideField(s, a, SCENARIO.jin.find(j => j.name === a.name)!);
    else decideRaiders(s, a);
  }
}

function decideField(s: GameState, a: JinArmy, spec: JinArmySpec) {
  if (a.inCity || !spec.relieve) return;
  const goal = spec.relieve.city, city = s.cities[goal];
  if (a.order === "hold" && a.at === a.home) {
    const trigger = spec.relieve.orWhenTaken ? s.cities[spec.relieve.orWhenTaken]?.taken : false;
    if (!city.taken && (city.besiegedDays >= spec.relieve.afterDays || trigger)) go(s, a, goal, "relieve");
    return;
  }
  if (a.order === "relieve") {
    if (city.taken) go(s, a, home(s, a), "return");
    // stopped by a column on the way: look for another road
    else if (!a.leg && !a.route.length) go(s, a, goal, "relieve");
    return;
  }
  if (a.order === "return" && !a.leg && !a.route.length && a.at !== home(s, a)) go(s, a, home(s, a), "return");
  if (a.order === "return" && a.at === home(s, a)) { a.order = "hold"; a.target = null; }
}

function decideRaiders(s: GameState, a: JinArmy) {
  const [lon, lat] = armyPosition(a);
  // horsemen do not wait for a column: they keep out of its reach
  if (nearestColumnKm(s, lon, lat) <= R.JIN_SIGHT_KM) {
    const safe = refuges(s, a).filter(id => id !== a.at && nearestColumnKm(s, graph.site(id).lon, graph.site(id).lat) > R.JIN_SIGHT_KM);
    const to = nearestByRoad(s, a, safe);
    if (to) go(s, a, to, "withdraw");
    return;
  }
  if (a.order === "raid" && a.target && s.sites[a.target].sheep > 0 && !columnAt(s, a.target)) return;
  const flock = nearestByRoad(s, a, knownFlocks(s, a));
  if (flock) { go(s, a, flock, "raid"); return; }
  const back = home(s, a);
  if (a.at === back && !a.leg) { a.order = "hold"; a.target = null; a.route = []; return; }
  // home is still within reach of a column: stay away, where it is or where it was going
  if (nearestColumnKm(s, graph.site(back).lon, graph.site(back).lat) <= R.JIN_SIGHT_KM) {
    if (!a.leg && !a.route.length) { a.order = "hold"; a.target = null; }
    return;
  }
  if (a.order !== "return" || (!a.leg && !a.route.length)) go(s, a, back, "return");
}

/** A city falls: an army inside it gets out and goes back home. */
export function cityFalls(s: GameState, id: string) {
  for (const a of s.jin) {
    if (a.at !== id || !a.inCity) continue;
    a.inCity = false;
    go(s, a, home(s, a), "return");
    log(s, `The Jin army in ${graph.site(id).name} breaks out and falls back.`, "warning");
  }
}

/** Day of the campaign a sighting was made, for "seen on" labels. */
export const sightingDate = (s: GameState, v: Sighting) => dateOf({ ...s, hour: v.hour });
