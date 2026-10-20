// Plays a whole campaign with a policy and records what a playtester would want to know:
// one sample a day, every battle, every decision put to the player, and anything that
// looks broken in the state. Pure: no printing, no files. See digest.ts for the text.

import { formatDate } from "../calendar";
import { armyMen } from "../jin";
import { dateOf, foodDays, newGame, step, totalHours, type GameState } from "../game";
import { SCENARIO } from "../scenario";
import { newMemory, POLICIES, type Policy } from "./policies";

const graph = SCENARIO.graph;

export interface RunOptions {
  policy: string;
  /** seed of the battle and event dice; the game's own seed when left out */
  seed?: number;
  /** sheep taken along at the start */
  sheep?: number;
  /** stop after this many days even if the campaign is not over */
  maxDays?: number;
}

/** The state of the campaign at the start of a day. Totals are over all columns. */
export interface DaySample {
  day: number;
  date: string;
  /** where the first column stands, or "a>b" on the road */
  where: string;
  men: number;
  horses: number;
  sheep: number;
  /** first column only: horses' condition, fatigue, morale, days of food */
  condition: number;
  fatigue: number;
  morale: number;
  food: number;
  favour: number;
  treasury: number;
  towns: number;
  jinMen: number;
  columns: number;
}

export interface BattleRecord {
  day: number;
  site: string;
  column: string;
  army: string;
  attacker: "mongol" | "jin";
  outcome: string;
  ratio: number;
  mongolLost: number;
  jinLost: number;
}

/** Something put to the player: a threat to answer, or an event to choose. */
export interface DecisionRecord {
  day: number;
  kind: string;
  site: string;
}

export interface RunRecord {
  policy: string;
  seed: number;
  sheep: number;
  final: GameState;
  samples: DaySample[];
  battles: BattleRecord[];
  decisions: DecisionRecord[];
  /** broken invariants, each reported once with the first day it was seen */
  problems: string[];
}

const DEFAULT_SHEEP = 6000;

export const shortDate = (s: GameState) => {
  const d = dateOf(s);
  return `${d.year}-${String(d.month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
};

export const longDate = (s: GameState) => formatDate(dateOf(s));

/** Where a column stands, in a few letters. */
export function whereOf(c: { at: string | null; leg: { from: string; to: string } | null; siege?: string | null }): string {
  if (c.at) return c.siege === c.at ? `${c.at}*` : c.at;
  if (c.leg) return `${c.leg.from}>${c.leg.to}`;
  return "?";
}

export function sample(s: GameState): DaySample {
  const c = s.columns[0];
  const sum = (f: (x: GameState["columns"][number]) => number) => s.columns.reduce((n, x) => n + f(x), 0);
  return {
    day: Math.floor(s.hour / 24),
    date: shortDate(s),
    where: c ? whereOf(c) : "-",
    men: Math.round(sum(x => x.men)),
    horses: Math.round(sum(x => x.horses)),
    sheep: Math.round(sum(x => x.sheep)),
    condition: c ? Math.round(c.condition) : 0,
    fatigue: c ? Math.round(c.fatigue) : 0,
    morale: c ? Math.round(c.morale) : 0,
    food: c ? Math.round(foodDays(c) * 10) / 10 : 0,
    favour: Math.round(s.favour),
    treasury: Math.round(s.treasury),
    towns: Object.values(s.cities).filter(x => x.taken).length,
    jinMen: Math.round(s.jin.reduce((n, a) => n + armyMen(a), 0)),
    columns: s.columns.filter(x => x.men > 0).length,
  };
}

/** Looks for numbers that no rule should produce. Returns a short description of each. */
export function checkInvariants(s: GameState): string[] {
  const out: string[] = [];
  const bad = (v: number) => !Number.isFinite(v);
  for (const c of s.columns) {
    for (const k of ["men", "horses", "sheep", "rations", "condition", "fatigue", "morale", "grain"] as const) {
      if (bad(c[k])) out.push(`${c.name}.${k} is ${c[k]}`);
      else if (c[k] < 0) out.push(`${c.name}.${k} is negative`);
    }
    for (const k of ["condition", "fatigue", "morale"] as const) if (c[k] > 100) out.push(`${c.name}.${k} above 100`);
    if (c.at && !graph.sites.some(x => x.id === c.at)) out.push(`${c.name} stands at unknown site ${c.at}`);
  }
  for (const a of s.jin) {
    if (bad(a.foot) || bad(a.horse) || a.foot < 0 || a.horse < 0) out.push(`${a.name} has ${a.foot} foot, ${a.horse} horse`);
  }
  for (const [id, city] of Object.entries(s.cities)) {
    if (bad(city.garrison) || city.garrison < 0) out.push(`${id}.garrison is ${city.garrison}`);
    if (bad(city.progress) || city.progress < 0 || city.progress > 100) out.push(`${id}.progress is ${city.progress}`);
  }
  for (const [id, site] of Object.entries(s.sites)) {
    for (const k of ["grazed", "sheep", "food", "grain", "livestock", "hostility"] as const) {
      if (bad(site[k]) || site[k] < 0) out.push(`site ${id}.${k} is ${site[k]}`);
    }
  }
  if (bad(s.favour) || bad(s.treasury) || s.treasury < 0) out.push(`favour ${s.favour}, treasury ${s.treasury}`);
  if (s.threat && (!s.columns[s.threat.column] || !s.jin[s.threat.army])) out.push("threat points at a missing column or army");
  if (s.event && !s.columns[s.event.column]) out.push("event points at a missing column");
  return out;
}

/**
 * Watches a running game hour by hour: the battles fought, the decisions raised,
 * the invariants broken. Shared by the whole-campaign runner and the turn-by-turn mode.
 */
export class Watcher {
  battles: BattleRecord[] = [];
  decisions: DecisionRecord[] = [];
  problems: string[] = [];
  private seen = new Set<string>();
  private lastBattle: unknown;
  private lastThreat: unknown;
  private lastEvent: unknown;

  constructor(s: GameState) {
    this.lastBattle = s.lastBattle;
    this.lastThreat = s.threat;
    this.lastEvent = s.event;
  }

  /** Called after each hour of the game, before the player answers. */
  observe(s: GameState) {
    const day = Math.floor(s.hour / 24);
    const b = s.lastBattle;
    if (b && b !== this.lastBattle && JSON.stringify(b) !== JSON.stringify(this.lastBattle)) {
      this.battles.push({
        day, site: b.site, column: b.column, army: b.army, attacker: b.attacker, outcome: b.result.outcome,
        ratio: Math.round(b.result.ratio * 100) / 100,
        mongolLost: Math.round(b.result.mongolLosses.men),
        jinLost: Math.round(b.result.jinLosses.foot + b.result.jinLosses.horse),
      });
    }
    this.lastBattle = b ? JSON.parse(JSON.stringify(b)) : b;
    if (s.threat && JSON.stringify(s.threat) !== JSON.stringify(this.lastThreat)) {
      this.decisions.push({ day, kind: `threat:${s.threat.kind}`, site: s.threat.site });
    }
    this.lastThreat = s.threat ? { ...s.threat } : null;
    if (s.event && JSON.stringify(s.event) !== JSON.stringify(this.lastEvent)) {
      this.decisions.push({ day, kind: `event:${s.event.id}`, site: s.event.site });
    }
    this.lastEvent = s.event ? { ...s.event } : null;
  }

  /** Called once a day: the invariants are costly enough not to be looked at every hour. */
  check(s: GameState) {
    for (const p of checkInvariants(s)) {
      const key = p.replace(/-?\d+(\.\d+)?/g, "#");
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.problems.push(`day ${Math.floor(s.hour / 24)}: ${p}`);
    }
  }
}

export function policyOf(id: string): Policy {
  const p = POLICIES[id];
  if (!p) throw new Error(`unknown policy "${id}": one of ${Object.keys(POLICIES).join(", ")}`);
  return p;
}

/** Plays a whole campaign with a policy, from the first day to the end. */
export function runGame(opts: RunOptions): RunRecord {
  const policy = policyOf(opts.policy);
  const sheep = opts.sheep ?? DEFAULT_SHEEP;
  const s = newGame(sheep);
  if (opts.seed !== undefined) s.rng = opts.seed;
  const seed = s.rng;
  const mem = newMemory();
  const watch = new Watcher(s);
  const samples: DaySample[] = [];
  const end = Math.min(totalHours(), (opts.maxDays ?? Infinity) * 24);
  while (!s.over && s.hour < end) {
    samples.push(sample(s));
    watch.check(s);
    policy.day(s, mem);
    for (let h = 0; h < 24 && !s.over; h++) {
      step(s);
      watch.observe(s);
      policy.hour(s);
    }
  }
  samples.push(sample(s));
  watch.check(s);
  return { policy: policy.id, seed, sheep, final: s, samples, battles: watch.battles, decisions: watch.decisions, problems: watch.problems };
}
