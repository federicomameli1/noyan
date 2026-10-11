// Battles of layer 1: the strength of the two sides, the outcome and the losses,
// for a Mongol column against a Jin army. Pure simulation: the game decides when
// battle is joined and what becomes of the result.
// Rules and numbers: design doc "07-regole-strato-1", section 4, and constants.ts.

import { conditionBand } from "./game";
import * as R from "./constants";

export type { Ground } from "./constants";

/** The Mongol column in the field: all horsemen, quality 1. */
export interface MongolForce {
  men: number;
  /** 0-100: the state of the horses decides what each rider is worth */
  condition: number;
  /** 0-100: tired horses fight worse */
  fatigue: number;
  /** 0-100, MONGOL_MORALE when absent */
  morale?: number;
  /** the Mongols fall on the Jin before they are ready */
  surprise?: boolean;
}

/** The Jin army: mostly footmen, with whatever horsemen the dynasty can still field. */
export interface JinForce {
  foot: number;
  horse: number;
  /** drill and equipment: 1 is a regular field army */
  quality: number;
  /** 0-100 */
  morale: number;
  surprise?: boolean;
  /** strength of the walls when the army stands in a city */
  walls?: number;
}

export interface BattleInput {
  mongol: MongolForce;
  jin: JinForce;
  /** where the battle is fought */
  ground: R.Ground;
  /** the luck of the day, one factor per side: 1 is an average day */
  luck?: { mongol: number; jin: number };
}

export type FactorId = "ground" | "horses" | "morale" | "surprise" | "walls" | "luck";

export interface BattleFactor {
  factor: FactorId;
  /** what the factor multiplies the strength of each side by */
  mongol: number;
  jin: number;
}

export interface BattleResult {
  /** Mongol strength over Jin strength */
  ratio: number;
  outcome: R.BattleOutcome;
  mongolLosses: { men: number; horses: number };
  jinLosses: { foot: number; horse: number };
  /** how each side's morale moves */
  morale: { mongol: number; jin: number };
  /** the heaviest factors of the day, heaviest first */
  factors: BattleFactor[];
}

const moraleFactor = (morale: number) => R.MORALE_BASE + morale / 100;

/** What each Mongol horseman is worth, by the state of his horses. */
function horseFactor(condition: number, fatigue: number): number {
  const byBand = R.HORSE_STRENGTH[conditionBand(condition)];
  return fatigue > R.TIRED_HORSES_FATIGUE ? byBand * R.TIRED_HORSES_FACTOR : byBand;
}

/** Strength of both sides: the men times what each of them is worth, times the day's factors. */
export function strength(input: BattleInput): { mongol: number; jin: number } {
  const m = input.mongol;
  const mongol = m.men * R.TROOP_VALUE.mongolHorse
    * horseFactor(m.condition, m.fatigue)
    * R.GROUND_HORSE[input.ground]
    * moraleFactor(m.morale ?? R.MONGOL_MORALE)
    * (m.surprise ? R.SURPRISE : 1)
    * (input.luck?.mongol ?? 1);
  const j = input.jin;
  const jin = (j.foot * R.TROOP_VALUE.jinFoot * R.GROUND_FOOT[input.ground]
      + j.horse * R.TROOP_VALUE.jinHorse * R.GROUND_HORSE[input.ground])
    * j.quality
    * (j.walls ?? 1)
    * moraleFactor(j.morale)
    * (j.surprise ? R.SURPRISE : 1)
    * (input.luck?.jin ?? 1);
  return { mongol, jin };
}

/** What the ground does for the Jin army as a whole: footmen and horsemen weighed by what they are worth. */
function jinGround(j: JinForce, ground: R.Ground): number {
  const foot = j.foot * R.TROOP_VALUE.jinFoot, horse = j.horse * R.TROOP_VALUE.jinHorse;
  return foot + horse > 0 ? (foot * R.GROUND_FOOT[ground] + horse * R.GROUND_HORSE[ground]) / (foot + horse) : 1;
}

/** The heaviest factors of the day: those that weigh most differently on the two sides. */
function factors(input: BattleInput): BattleFactor[] {
  const m = input.mongol, j = input.jin;
  const all: BattleFactor[] = [
    { factor: "ground", mongol: R.GROUND_HORSE[input.ground], jin: jinGround(j, input.ground) },
    { factor: "horses", mongol: horseFactor(m.condition, m.fatigue), jin: 1 },
    { factor: "morale", mongol: moraleFactor(m.morale ?? R.MONGOL_MORALE), jin: moraleFactor(j.morale) },
    { factor: "surprise", mongol: m.surprise ? R.SURPRISE : 1, jin: j.surprise ? R.SURPRISE : 1 },
    { factor: "walls", mongol: 1, jin: j.walls ?? 1 },
    { factor: "luck", mongol: input.luck?.mongol ?? 1, jin: input.luck?.jin ?? 1 },
  ];
  return all
    .filter(f => Math.abs(Math.log(f.mongol / f.jin)) > 1e-9) // a factor that weighs the same on both sides says nothing
    .sort((a, b) => Math.abs(Math.log(b.mongol / b.jin)) - Math.abs(Math.log(a.mongol / a.jin)))
    .slice(0, 4);
}

/** Fights the battle: strengths, outcome, losses, morale and the factors behind it all. */
export function resolveBattle(input: BattleInput): BattleResult {
  const { mongol, jin } = strength(input);
  const ratio = mongol / jin;
  const rule = R.OUTCOMES.find(o => ratio >= o.min)!;
  const band = conditionBand(input.mongol.condition);
  // the Mongols ride the fugitives down, unless their horses are spent
  const pursuit = (rule.id === "rout" || rule.id === "victory") && band !== "exhausted";
  // an orderly retreat saves lives, if the horses can still run
  const orderly = (rule.id === "defeat" || rule.id === "disaster") && (band === "fat" || band === "fit");
  const mongolMen = input.mongol.men * rule.mongolLosses * (orderly ? 1 - R.RETREAT_RELIEF : 1);
  const jinMen = (input.jin.foot + input.jin.horse) * (rule.jinLosses + (pursuit ? R.PURSUIT_LOSSES : 0));
  const total = input.jin.foot + input.jin.horse;
  return {
    ratio,
    outcome: rule.id,
    mongolLosses: { men: mongolMen, horses: mongolMen * R.HORSES_LOST_PER_MAN },
    jinLosses: total > 0
      ? { foot: jinMen * (input.jin.foot / total), horse: jinMen * (input.jin.horse / total) }
      : { foot: 0, horse: 0 },
    morale: rule.id === "draw" ? { mongol: 0, jin: 0 }
      : rule.id === "rout" ? { mongol: R.MORALE_WIN, jin: R.MORALE_ROUT }
      : rule.id === "victory" ? { mongol: R.MORALE_WIN, jin: R.MORALE_LOSS }
      : rule.id === "defeat" ? { mongol: R.MORALE_LOSS, jin: R.MORALE_WIN }
      : { mongol: R.MORALE_ROUT, jin: R.MORALE_WIN },
    factors: factors(input),
  };
}

/** One throw of the dice: a number between 0 and 1, and the state for the next throw. Pure, so a game can keep the state in itself. */
export function randomStep(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

/**
 * Seeded random generator (mulberry32) on that step: each call returns the next number between
 * 0 and 1. The same seed gives the same sequence, so a battle can be replayed and told again.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    const d = randomStep(a);
    a = d.state;
    return d.value;
  };
}

/** One side's luck, drawn from the generator: between LUCK_MIN and LUCK_MIN + LUCK_SPAN. */
export const luck = (next: () => number): number => R.LUCK_MIN + R.LUCK_SPAN * next();
