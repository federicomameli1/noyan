// The countryside around Jin places (layer 1): food, grain and livestock that a column can requisition
// or plunder, and the hostility of the people it leaves behind. Feeding the army today costs tomorrow.
// Rules: design doc "07-regole-strato-1", section 7. Numbers in constants.ts.

import * as R from "./constants";
import { dateOf, log, type Column, type GameState } from "./game";
import type { Site } from "./graph";
import { SCENARIO } from "./scenario";

const graph = SCENARIO.graph;
const fmt = (n: number) => Math.round(n).toLocaleString("en");

export type ForageKind = "requisition" | "plunder";

/** How many villages around a place: 0 none, 1 sparse, 2 middling, 3 dense. Mongol land and passes have none to take. */
export function population(site: Site): 0 | 1 | 2 | 3 {
  if (site.control === "mongols" || site.kind === "pass" || site.kind === "pasture") return 0;
  const plain = site.terrain === "plain";
  if (site.kind === "city") return plain ? 3 : 2;
  return plain ? 2 : 1;
}

/** The countryside of a place at the start of the campaign, just after the harvest. */
export function newCountry(site: Site) {
  const p = population(site);
  return {
    food: p * R.COUNTRY_FOOD, grain: p * R.COUNTRY_GRAIN, livestock: p * R.COUNTRY_LIVESTOCK, burned: false,
    hostility: p ? R.HOSTILITY_START[site.control] : 0,
  };
}

/** The Jin city whose garrison guards the villages of this place, if any: the place itself or a neighbour. */
export function guardedBy(s: GameState, id: string): string | null {
  for (const x of [id, ...graph.neighbours(id).map(n => n.to)]) {
    const city = s.cities[x];
    if (city && !city.taken && city.garrison > 0) return x;
  }
  return null;
}

/** What requisitioning or plundering this place would bring in now. Grain in horse-days. */
export function forageYield(s: GameState, id: string, kind: ForageKind): { food: number; grain: number; livestock: number } {
  const st = s.sites[id];
  if (kind === "plunder") return { food: st.food * R.PLUNDER_SHARE, grain: st.grain * R.PLUNDER_SHARE, livestock: st.livestock * R.PLUNDER_SHARE };
  const share = R.REQUISITION_SHARE * (st.hostility > R.HIDE_HOSTILITY ? 0.5 : 1);
  return { food: st.food * share, grain: st.grain * share, livestock: 0 };
}

export const forageDays = (kind: ForageKind) => (kind === "plunder" ? R.PLUNDER_DAYS : R.REQUISITION_DAYS);

/** Why the column cannot requisition or plunder where it stands, or null if it can. */
export function forageBlock(s: GameState, c: Column, kind: ForageKind): string | null {
  if (!c.at || c.leg || c.men <= 0) return "The column must stand at a place.";
  if (c.foraging) return "The men are already out in the villages.";
  const site = graph.site(c.at), st = s.sites[c.at];
  if (!population(site)) return "There are no villages here to take from.";
  if (st.burned) return "The fields here have been burned: nothing is left.";
  if (kind === "plunder") {
    const g = guardedBy(s, c.at);
    if (g) return `The garrison of ${graph.site(g).name} is too close: the villages can be made to give, not sacked.`;
  }
  return null;
}

/** Sends the men out into the villages for a day (requisition) or two (plunder). The column stays where it is. */
export function orderForage(s: GameState, ci: number, kind: ForageKind): boolean {
  const c = s.columns[ci];
  if (forageBlock(s, c, kind)) return false;
  c.foraging = { kind, until: s.hour + forageDays(kind) * 24 };
  c.route = [];
  c.waiting = null;
  const name = graph.site(c.at!).name;
  log(s, kind === "plunder" ? `${c.name} turns its men loose on the villages around ${name}.` : `${c.name} sends men to the villages around ${name} to requisition food.`);
  return true;
}

/** Calls the foragers back before they are done: nothing is taken. */
export function cancelForage(s: GameState, c: Column) {
  if (!c.foraging) return;
  c.foraging = null;
  log(s, `${c.name} calls its men back from the villages empty-handed.`);
}

/** Raises the hostility of a place, and half as much in the places around it: word travels. */
function anger(s: GameState, id: string, by: number) {
  const raise = (x: string, v: number) => { if (population(graph.site(x))) s.sites[x].hostility = Math.min(100, s.sites[x].hostility + v); };
  raise(id, by);
  for (const n of graph.neighbours(id)) raise(n.to, by * R.HOSTILITY_SPILL);
}

/** Every hour: foragers that are done bring in what they took. */
export function stepForage(s: GameState, c: Column) {
  const f = c.foraging;
  if (!f || s.hour < f.until) return;
  c.foraging = null;
  if (!c.at) return;
  const id = c.at, st = s.sites[id], name = graph.site(id).name;
  const t = forageYield(s, id, f.kind);
  c.rations += t.food;
  if (c.horses > 0) c.grain += t.grain / c.horses;
  c.sheep += t.livestock;
  const grainDays = c.horses > 0 ? t.grain / c.horses : 0;
  if (f.kind === "plunder") {
    // what is not carried away is burned: nothing grows back before the next harvest
    Object.assign(st, { food: 0, grain: 0, livestock: 0, burned: true });
    anger(s, id, R.PLUNDER_HOSTILITY);
    log(s, `${c.name} sacks the villages around ${name} and burns the fields: ${fmt(t.food)} rations, ${grainDays.toFixed(1)} days of grain for the horses `
      + `and ${fmt(t.livestock)} head of livestock, which walk at the flock's pace.`, "arrival");
  } else {
    st.food -= t.food;
    st.grain -= t.grain;
    anger(s, id, R.REQUISITION_HOSTILITY);
    log(s, `${c.name} brings in ${fmt(t.food)} rations and ${grainDays.toFixed(1)} days of grain for the horses from the villages around ${name}.`, "arrival");
  }
}

/** Once a day: winter eats into what the villages hold, anger slowly cools, and angry villagers steal horses at night. */
export function countryDay(s: GameState) {
  const month = dateOf(s).month;
  const winter = R.WINTER_MONTHS.includes(month);
  for (const site of graph.sites) {
    const st = s.sites[site.id];
    if (!population(site)) continue;
    if (winter) { st.food *= 1 - R.WINTER_LOSS / 30; st.grain *= 1 - R.WINTER_LOSS / 30; }
    st.hostility = Math.max(R.HOSTILITY_START[site.control], st.hostility - R.HOSTILITY_COOLING);
  }
  for (const c of s.columns) {
    if (!c.at || c.men <= 0 || s.sites[c.at].hostility <= R.THEFT_HOSTILITY) continue;
    const lost = Math.round(c.horses * R.HORSE_THEFT);
    if (lost <= 0) continue;
    c.horses -= lost;
    log(s, `Villagers around ${graph.site(c.at).name} steal ${fmt(lost)} of ${c.name}'s horses in the night.`, "warning");
  }
}

/** Slaughters the whole flock at once: without time to dry the meat, half of it spoils. */
export function slaughterFlock(s: GameState, ci: number): boolean {
  const c = s.columns[ci];
  if (c.sheep <= 0) return false;
  const rations = c.sheep * R.RATIONS_PER_SHEEP * R.SLAUGHTER_SHARE;
  log(s, `${c.name} slaughters its ${fmt(c.sheep)} head of livestock: ${fmt(rations)} rations, the rest spoils.`);
  c.rations += rations;
  c.sheep = 0;
  return true;
}
