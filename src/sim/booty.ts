// Booty and remounts (layer 1): the goods of a fallen town buy horses, and horses are what a
// column loses in every battle. The khan's remount herds bring them, but they take days to
// come, and the Mongols have to hold ground where the herds can graze. Numbers in constants.ts.

import * as R from "./constants";
import { anger } from "./country";
import type { GameState } from "./game";
import { log } from "./journal";
import { SCENARIO } from "./scenario";

const graph = SCENARIO.graph;
const fmt = (n: number) => Math.round(n).toLocaleString("en");

/** True if the Mongols hold this place: the remount herds can graze here. */
export function mongolGround(s: GameState, id: string): boolean {
  if (s.cities[id]?.taken) return true;
  return graph.site(id).control === "mongols";
}

/** The goods a town holds, for every man of its garrison. Also used by the interface. */
export const bootyOf = (garrison: number) => Math.round(garrison * R.BOOTY_PER_MAN);

/** Sacks the town the column stands in: its goods go to the treasury, the countryside is angry. */
export function orderSack(s: GameState, ci: number): boolean {
  const c = s.columns[ci];
  if (!c.at) return false;
  const city = s.cities[c.at];
  if (!city || !city.taken || city.sacked || city.booty <= 0) return false;
  const goods = city.booty;
  city.sacked = true;
  s.treasury += goods;
  anger(s, c.at, R.SACK_HOSTILITY);
  log(s, `${c.name} sacks ${graph.site(c.at).name}: ${fmt(goods)} goods for the treasury, and the country is left in mourning.`);
  return true;
}

/** The goods taken from the towns, over the whole campaign. */
export const goodsTaken = (s: GameState) => Object.values(s.cities).reduce((n, c) => n + (c.sacked ? c.booty : 0), 0);

/** The most horses the treasury can pay for, rounded down to whole tens. */
export function remountsAffordable(s: GameState): number {
  const n = Math.min(R.REMOUNT_MAX, Math.floor(s.treasury / R.HORSE_PRICE));
  return Math.floor(n / 10) * 10;
}

/** Calls the khan's remount herds: the goods are spent, the horses come in a few days. */
export function orderRemounts(s: GameState, ci: number, horses: number): boolean {
  const c = s.columns[ci];
  if (!c.at) return false;
  if (!mongolGround(s, c.at)) return false;
  const n = Math.min(Math.floor(horses), remountsAffordable(s));
  if (n <= 0) return false;
  s.treasury -= n * R.HORSE_PRICE;
  s.remounts.push({ site: c.at, horses: n, hour: s.hour + R.REMOUNT_DAYS * 24 });
  log(s, `${c.name} calls ${fmt(n)} remounts from the khan's herds: they will reach ${graph.site(c.at).name} in ${R.REMOUNT_DAYS} days.`);
  return true;
}

/** Once an hour: the remounts that arrive wait at their place, and a column there takes them. */
export function stepBooty(s: GameState) {
  // the orders that are due leave the list first: taking them out while going through the
  // list would skip the one that follows
  const due = s.remounts.filter(r => s.hour >= r.hour);
  s.remounts = s.remounts.filter(r => s.hour < r.hour);
  for (const r of due) {
    s.sites[r.site].remounts += r.horses;
    log(s, `${fmt(r.horses)} remounts reach ${graph.site(r.site).name}.`);
  }
  for (const c of s.columns) {
    if (!c.at || c.men <= 0) continue;
    const waiting = s.sites[c.at].remounts;
    if (waiting <= 0) continue;
    s.sites[c.at].remounts = 0;
    c.horses += waiting;
    log(s, `${c.name} takes the ${fmt(waiting)} remounts waiting at ${graph.site(c.at).name}.`, "arrival");
  }
}
