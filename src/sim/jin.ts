// Jin armies in the field (layer 1): they march, relieve besieged cities, raid flocks left behind
// and fight. A field army bars the road through the place where it stands, and a column stops in
// front of it. Any army that judges itself clearly stronger than a column within reach sets out to
// attack it; horsemen pick on weak columns and keep away from strong ones.
// What the Mongols know of them depends on distance: the closer the scouts, the more they see.

import * as R from "./constants";
import { strength } from "./battle";
import { distanceKm, findPath, type Site } from "./graph";
import { advance, armyForce, battleGround, campSite, columnForce, columnPosition, conditionBand, dateOf, orderFight, type Column, type GameState, type Leg, type Mover } from "./game";
import { log } from "./journal";
import { daysBetween } from "./calendar";
import { SCENARIO, type JinArmySpec } from "./scenario";

const graph = SCENARIO.graph;

/** hold: stays where it is · relieve: marches to a besieged city · raid: goes after a flock · attack: sets out against a column · return: back home · withdraw: away from a column */
export type JinOrder = "hold" | "relieve" | "raid" | "attack" | "return" | "withdraw";

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
  /** days of food left: field armies eat their stores, raiders live off the land */
  food: number;
  /** the city this army goes to relieve, and after how many days of siege: kept in the state, so the army needs no name to be found */
  relieve?: { city: string; afterDays: number; orWhenTaken?: string };
}

/** A Jin wagon convoy carrying food from a home city to an army in the field. `army` indexes `s.jin`. */
export interface Convoy extends Mover {
  army: number;
  /** days of food it carries */
  food: number;
}

/** A Jin army as it stands in the state. */
export function newJinArmy(j: JinArmySpec): JinArmy {
  return {
    name: j.name, kind: j.kind, foot: j.foot, horse: j.horse, quality: j.quality, morale: j.morale, kmPerDay: j.kmPerDay, home: j.home,
    at: j.home, leg: null, cameFrom: null, route: [], order: "hold", target: null, inCity: false, sight: 0, seen: null, reported: 0,
    food: j.kind === "field" ? R.JIN_FOOD_DAYS : 0, relieve: j.relieve,
  };
}

export function newJin(): JinArmy[] {
  return SCENARIO.jin.map(newJinArmy);
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
    case "attack": return `marching to attack the column at ${to}`;
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

/** Can the army march on into `next`? Not where a column stands, unless that is where it is going to fight or to relieve. */
function canEnter(s: GameState, a: JinArmy, next: string, last: boolean): boolean {
  if (!columnAt(s, next)) return true;
  return last && (a.order === "attack" || (a.kind === "field" && a.order === "relieve"));
}

/** Moves the armies one hour, then updates what the scouts see. Called by `step` after the columns. */
export function stepJin(s: GameState, hourOfDay: number) {
  // the player let time run without answering an army upon a column: the column stands and fights
  if (s.threat && s.threat.hour < s.hour) orderFight(s);
  if (s.over) return;
  // an army sent against a column catches up with it: the player chooses to fight or to ride away
  if (!s.threat) {
    for (const [ai, a] of s.jin.entries()) {
      if (a.order !== "attack" || !a.at || armyMen(a) <= 0) continue;
      const ci = s.columns.findIndex(c => c.at === a.at && c.men > 0);
      if (ci < 0) continue;
      s.threat = { kind: "attack", column: ci, army: ai, hour: s.hour };
      log(s, `The ${a.name} is upon ${s.columns[ci].name} at ${graph.site(a.at).name}. Stand and fight, or ride away.`, "alert");
      break;
    }
  }
  const marching = hourOfDay >= R.MARCH_START_HOUR && hourOfDay < R.MARCH_START_HOUR + R.JIN_MARCH_HOURS;
  if (marching) {
    for (const a of s.jin) {
      if (armyMen(a) <= 0 || (!a.leg && !a.route.length)) continue;
      advance(a, a.kmPerDay / R.JIN_MARCH_HOURS, (next, last) => canEnter(s, a, next, last), site => {
        if (!a.route.length) arrive(s, a, site);
      });
    }
  }
  stepConvoys(s, marching);
  updateSightings(s);
}

/** True while a field army is out in the field, away from the towns that feed it. */
const inField = (s: GameState, a: JinArmy) =>
  !a.inCity && !(a.at !== null && (a.at === a.home || (s.cities[a.at] && !s.cities[a.at].taken)));

/** An army's food is gone: it loses men and spirit, and may fall back. `started` marks the first day. */
function starve(s: GameState, a: JinArmy, started: boolean) {
  a.food = 0;
  a.morale = Math.max(0, a.morale - R.HUNGER_MORALE);
  a.foot = Math.max(0, a.foot - Math.round(a.foot * R.HUNGER_DESERTION));
  a.horse = Math.max(0, a.horse - Math.round(a.horse * R.HUNGER_DESERTION));
  if (started && a.sight > 0) log(s, `The ${a.name} is going hungry: its convoys are not getting through.`, "warning");
  if (a.morale < R.JIN_RETREAT_MORALE && a.order !== "return") {
    goHome(s, a);
    log(s, `The ${a.name} falls back for lack of food.`, "warning");
  }
}

/** Points a convoy at a site, keeping any leg it is already on. */
function convoyRoute(cv: Convoy, dest: string) {
  const from = cv.at ?? cv.leg!.to;
  if (from === dest) { cv.route = []; return; }
  const path = findPath(graph, from, dest);
  cv.route = path ? path.slice(1) : [];
}

/** A convoy that can no longer reach its army and has got back home is done: it can be removed. */
const homeAgain = (s: GameState, cv: Convoy) => {
  const a = s.jin[cv.army];
  if (cv.leg || cv.at !== a.home) return false;
  return armyMen(a) <= 0 || !!s.cities[a.home]?.taken;
};

/**
 * Once a day, at midnight, before the armies decide: the food of each field army runs down,
 * the hungry lose men and spirit, convoys go out every few days, and the ones already out
 * follow the armies they feed or turn back when there is no one left to feed.
 */
export function supplyDay(s: GameState) {
  for (const a of s.jin) {
    if (a.kind !== "field" || armyMen(a) <= 0) continue;
    const before = a.food;
    if (inField(s, a)) a.food -= 1;
    else a.food = R.JIN_FOOD_DAYS;
    if (a.food <= 0) starve(s, a, before > 0);
  }
  s.convoyDay += 1;
  if (s.convoyDay >= R.CONVOY_EVERY) {
    s.convoyDay = 0;
    for (const [i, a] of s.jin.entries()) {
      if (a.kind !== "field" || armyMen(a) <= 0 || !inField(s, a) || s.cities[a.home]?.taken) continue;
      const to = a.at ?? a.leg!.to;
      const path = findPath(graph, a.home, to);
      if (path) s.convoys.push({ at: a.home, leg: null, cameFrom: null, route: path.slice(1), army: i, food: R.CONVOY_FOOD });
    }
  }
  for (const cv of s.convoys) {
    const a = s.jin[cv.army];
    convoyRoute(cv, armyMen(a) <= 0 || s.cities[a.home]?.taken ? a.home : a.at ?? a.leg!.to);
  }
  s.convoys = s.convoys.filter(cv => !homeAgain(s, cv));
}

/** Moves the convoys, delivers the ones that reach their army, and lets columns fall on the others. */
function stepConvoys(s: GameState, marching: boolean) {
  if (marching) {
    for (const cv of s.convoys) {
      if (!cv.leg && !cv.route.length) continue;
      // a column standing on the road stops the wagons at its place, where it falls on them below
      const blocked = () => s.columns.some(c => c.men > 0 && c.at !== null && c.at === cv.at);
      advance(cv, R.CONVOY_KM_PER_DAY / R.JIN_MARCH_HOURS, () => !blocked(), () => {});
    }
  }
  for (const cv of [...s.convoys]) {
    const a = s.jin[cv.army];
    if (!a) continue;
    // a convoy that can no longer reach its army and has got back home is done
    if (homeAgain(s, cv)) { s.convoys.splice(s.convoys.indexOf(cv), 1); continue; }
    // the convoy reaches the army where it stands: it is handed over
    if (a.at !== null && !s.cities[a.home]?.taken && armyMen(a) > 0 && cv.at === a.at) {
      a.food = Math.min(R.JIN_FOOD_DAYS, a.food + cv.food);
      s.convoys.splice(s.convoys.indexOf(cv), 1);
      continue;
    }
    // a column at the same place falls on it: only columns standing at a site, not on a link
    if (!cv.at) continue;
    const c = s.columns.find(c => c.at === cv.at && c.men > 0);
    if (!c) continue;
    // as with a city's stores, the column takes no more than it can carry
    const rations = Math.max(0, Math.min(R.CONVOY_FOOD * armyMen(a) * R.CONVOY_RATIONS_SHARE, c.men * R.MAX_RATION_DAYS - c.rations));
    c.rations += rations;
    c.grain += R.CONVOY_GRAIN_DAYS;
    log(s, `${c.name} falls on a Jin supply convoy near ${graph.site(cv.at).name}: ${fmt(rations)} rations and ${R.CONVOY_GRAIN_DAYS} days of grain. The ${a.name} will go hungry.`, "arrival");
    s.convoys.splice(s.convoys.indexOf(cv), 1);
  }
}

/** An army reaches the end of its route. */
function arrive(s: GameState, a: JinArmy, site: string) {
  if (a.order === "relieve" && site === a.target) {
    const city = s.cities[site];
    if (!city || city.taken) return;
    // a column besieges the city: it must fight the relief army or lift the siege
    const ci = s.columns.findIndex(c => c.siege === site && c.men > 0);
    if (ci >= 0 && !s.threat) {
      a.order = "hold";
      s.threat = { kind: "relief", column: ci, army: s.jin.indexOf(a), hour: s.hour };
      log(s, `The ${a.name} reaches ${graph.site(site).name}, and the garrison makes ready to sally. Fight them, or lift the siege.`, "alert");
      return;
    }
    enterCity(s, a, site);
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
  const homes = [...SCENARIO.jin, ...SCENARIO.jinReserves].map(j => j.home);
  return [...new Set([...towns, ...homes, a.home])].filter(id => !s.cities[id]?.taken);
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

/** Once a day, at midnight: the convoys run and the food is counted, then each army chooses what to do. */
export function jinDecide(s: GameState) {
  supplyDay(s);
  jinReserves(s);
  for (const a of s.jin) {
    if (armyMen(a) <= 0) continue;
    if (decideAttack(s, a)) continue;
    if (a.kind === "field") decideField(s, a);
    else decideRaiders(s, a);
  }
}

/**
 * The war effort of the Jin: on the day given, the dynasty sends another army from the south.
 * The army appears at its home town and works like the others: it marches, it relieves, it fights.
 */
export function jinReserves(s: GameState) {
  const next = SCENARIO.jinReserves[s.jinArrived];
  if (!next) return;
  if (s.hour < daysBetween(SCENARIO.start, next.date) * 24) return;
  s.jinArrived += 1;
  const a = newJinArmy(next);
  s.jin.push(a);
  log(s, `The Jin send another army: the ${a.name}, ${fmt(armyMen(a))} men, marches out of ${graph.site(a.home).name}.`, "alert");
}

/** How strong the army judges itself against a column, fighting where the column camps: above 1 it thinks it wins. */
export function attackEstimate(s: GameState, a: JinArmy, c: Column): number {
  const st = strength({ mongol: columnForce(c), jin: armyForce(s, a), ground: battleGround(campSite(c)) });
  return st.jin / st.mongol;
}

/**
 * An army that judges itself clearly stronger than a column within reach sets out to attack it,
 * the nearest by road if there are several. One that no longer does gives up and goes home.
 * True if the army's day is decided. An army inside a city stays behind its walls.
 */
function decideAttack(s: GameState, a: JinArmy): boolean {
  if (a.inCity) return false;
  const [lon, lat] = armyPosition(a);
  const targets = s.columns
    .filter(c => c.men > 0 && distanceKm(lon, lat, ...columnPosition(c)) <= R.JIN_SIGHT_KM && attackEstimate(s, a, c) >= R.JIN_ATTACK_RATIO)
    .map(c => campSite(c).id);
  const to = nearestByRoad(s, a, targets);
  if (to) { go(s, a, to, "attack"); return true; }
  if (a.order === "attack") { goHome(s, a); return true; }
  return false;
}

/** The army goes into a city it came to relieve, with food for it. While it holds the city the siege can make no headway. */
export function enterCity(s: GameState, a: JinArmy, site: string) {
  const city = s.cities[site];
  if (!city || city.taken) return;
  a.inCity = true;
  a.order = "hold";
  a.target = null;
  a.route = [];
  city.stores += R.RELIEF_STORES;
  const watched = s.columns.some(c => c.siege === site) || a.sight > 0;
  if (watched) log(s, `The ${a.name} enters ${graph.site(site).name} with ${fmt(armyMen(a))} men and food. While it holds the city the siege can make no headway: storm the walls, or march away.`, "alert");
}

/** Sends the army back home, or to the nearest Jin town if home has fallen. Out of any city it was holding. */
export function goHome(s: GameState, a: JinArmy) {
  a.inCity = false;
  go(s, a, home(s, a), "return");
}

function decideField(s: GameState, a: JinArmy) {
  const spec = a.relieve;
  if (a.inCity || !spec) return;
  const goal = spec.city, city = s.cities[goal];
  if (a.order === "hold" && a.at === a.home) {
    const trigger = spec.orWhenTaken ? s.cities[spec.orWhenTaken]?.taken : false;
    if (!city.taken && (city.besiegedDays >= spec.afterDays || trigger)) go(s, a, goal, "relieve");
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
