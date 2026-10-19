// Dividing a column, and joining columns again (layer 1): a noyan with five thousand men
// can send half of them to take a town while the rest lays siege to another. Each column has
// its own orders, and a column too small to campaign is not worth having.

import * as R from "./constants";
import { conditionBand, foodDays, log, type Column, type GameState } from "./game";

const fmt = (n: number) => Math.round(n).toLocaleString("en");

/** True if the column can be divided in two: it stands at a place, and both halves would be an army. */
export function canSplit(c: Column): boolean {
  return !!c.at && !c.leg && c.men >= 2 * R.DEFEAT_MEN + 1;
}

/** The most men a column can send away and still be an army on its own. */
export const maxSplit = (c: Column) => c.men - R.DEFEAT_MEN;

/** The name of a new column, so that no two columns carry the same name. */
function uniqueName(base: string, s: GameState): string {
  const taken = new Set(s.columns.map(c => c.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const name = `${base} ${i}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Divides the column: `men` men go to a new column standing where the old one stands.
 * The new column keeps its share of the horses, the rations, the sheep and the grain; the
 * engineers stay with the column they were taken to.
 */
export function orderSplit(s: GameState, ci: number, men: number): boolean {
  const c = s.columns[ci];
  if (!canSplit(c)) return false;
  const n = Math.min(Math.floor(men), maxSplit(c));
  if (n < R.DEFEAT_MEN) return false;
  const share = n / c.men;
  const b: Column = {
    ...JSON.parse(JSON.stringify(c)),
    name: uniqueName(`${c.name}'s detachment`, s),
    men: n,
    horses: Math.round(c.horses * share),
    rations: c.rations * share,
    sheep: c.sheep * share,
    grain: c.grain * share,
    engineers: false,
    route: [], leg: null, at: c.at, cameFrom: null, halted: false, waiting: null, siege: null, foraging: null,
    restUntil: 0, today: { marchHours: 0, km: 0 }, lastDay: null,
    reported: { band: conditionBand(c.condition), foodDays: 0, starving: false },
  };
  b.reported.foodDays = foodDays(b);
  // the old column keeps the rest
  c.men -= n;
  c.horses -= b.horses;
  c.rations -= b.rations;
  c.sheep -= b.sheep;
  c.grain -= b.grain;
  c.reported.foodDays = foodDays(c);
  s.columns.push(b);
  log(s, `${c.name} divides: ${fmt(n)} men march off as ${b.name}.`);
  return true;
}

/** True if two columns can be joined: they stand at the same place. */
export function canMerge(a: Column, b: Column): boolean {
  return !!a.at && a.at === b.at && !a.leg && !b.leg;
}

/**
 * Joins the column `cj` into the column `ci`: one column, with all the men, horses, food and
 * grain of the two. The name of the first is kept, and the answers waiting for the player
 * follow the column that is left.
 */
export function orderMerge(s: GameState, ci: number, cj: number): boolean {
  const a = s.columns[ci], b = s.columns[cj];
  if (!a || !b || ci === cj || !canMerge(a, b)) return false;
  const men = a.men + b.men;
  a.condition = (a.condition * a.men + b.condition * b.men) / Math.max(1, men);
  a.morale = (a.morale * a.men + b.morale * b.men) / Math.max(1, men);
  a.men = men;
  a.horses += b.horses;
  a.rations += b.rations;
  a.sheep += b.sheep;
  a.grain += b.grain;
  a.engineers = a.engineers || b.engineers;
  if (!a.siege && b.siege) a.siege = b.siege;
  a.reported.foodDays = foodDays(a);
  s.columns.splice(cj, 1);
  // the answers waiting for the player point at columns by index: they follow the column left
  if (s.threat) s.threat.column = s.threat.column === cj ? ci : s.threat.column - (cj < s.threat.column ? 1 : 0);
  if (s.event) s.event.column = s.event.column === cj ? ci : s.event.column - (cj < s.event.column ? 1 : 0);
  log(s, `${a.name} and ${b.name} join: one column of ${fmt(men)} men.`);
  return true;
}

/** The other column standing at the same place, if there is one. */
export function companionColumn(s: GameState, c: Column, except: number): number {
  return s.columns.findIndex((x, i) => i !== except && canMerge(c, x));
}
