// Every tunable number of the layer 0 rules lives here.
// Design notes and sources: brainstorming doc "03-regole-strato-0" in the project files.
// Tags: [D] documented, [R] modern estimate, [S] game estimate, to be tuned by playing.

import type { Terrain } from "./world";

/** Real seconds per game day at 1x speed. */
export const SECONDS_PER_DAY = 8;
export const SPEEDS = [1, 2, 4] as const;

export type PaceId = "grazing" | "normal" | "forced";

export interface Pace {
  /** hours of marching per day, starting at MARCH_START_HOUR */
  marchHours: number;
  /** km per hour on a road, before terrain and horse state */
  kmPerHour: number;
  /** fatigue gained per hour of marching, with 4 horses per man */
  fatiguePerHour: number;
  /** share of the marching hours that also counts as grazing */
  grazeWhileMarching: number;
}

export const PACES: Record<PaceId, Pace> = {
  grazing: { marchHours: 6, kmPerHour: 2.5, fatiguePerHour: 0.5, grazeWhileMarching: 0.6 }, // [S] flock speed ~15 km/day [R]
  normal: { marchHours: 7, kmPerHour: 5, fatiguePerHour: 1.7, grazeWhileMarching: 0 }, // [R] 30-40 km/day sustained
  forced: { marchHours: 11, kmPerHour: 5, fatiguePerHour: 3.2, grazeWhileMarching: 0 }, // [S]
};
export const MARCH_START_HOUR = 6;

export type LinkKind = "road" | "track" | "mountain" | "pass";
export const LINKS: Record<LinkKind, { speed: number; winding: number }> = {
  road: { speed: 1, winding: 1.2 }, // [S] winding: real length over straight-line distance
  track: { speed: 0.85, winding: 1.15 },
  mountain: { speed: 0.7, winding: 1.3 },
  pass: { speed: 0.6, winding: 1.3 },
};

// --- horses ---
/** dry matter eaten per day at rest, kg: 2-2.5% of a 250-300 kg horse [R] */
export const HORSE_NEED_REST = 6;
/** extra kg per km carried with a rider [S] */
export const HORSE_NEED_PER_KM = 0.07;
/** a spare horse walking unloaded works this much compared with a ridden one [S] */
export const SPARE_HORSE_WORK = 0.3;
/** maximum hours of grazing a day outside marching (rest, watering, night) [S] */
export const MAX_GRAZE_HOURS = 13;
/** hours a day that are neither marching nor grazing [S] */
export const CAMP_HOURS = 4;
/** grazing intake: kg/h at most, and density (t/km²) at which half of that is reached [S] */
export const GRAZE_MAX_KG_PER_HOUR = 1;
export const GRAZE_HALF_DENSITY = 8;
/** condition change per day: 3 x (eaten/needed - 1), clamped [S] */
export const CONDITION_RATE = 3;
export const CONDITION_MAX_GAIN = 0.5;
export const CONDITION_MAX_LOSS = 3;
/** fatigue recovered per hour without marching, scaled down when condition is low [S] */
export const FATIGUE_RECOVERY = 1;
/** daily deaths: share of the herd [S] */
export const DEATHS_THIN = 0.005; // condition < 20
export const DEATHS_STARVING = 0.02; // condition < 10
export const DEATHS_EXHAUSTED = 0.01; // fatigue > 90
/** a night without water [S] */
export const DRY_CAMP_FATIGUE = 10;
export const DRY_CAMP_CONDITION = 1;

// --- pasture ---
/** usable dry matter, tonnes per km², in the best month [R] steppe and desert, [S] the rest */
export const PASTURE_DENSITY: Record<Terrain, number> = { steppe: 40, upland: 25, plain: 15, mountain: 10, desert: 5 };
/** monthly factor, January first [S] */
export const PASTURE_SEASON: Record<Terrain, readonly number[]> = {
  //         J    F    M    A    M    J    J    A    S    O    N    D
  steppe:   [0.5, 0.4, 0.3, 0.3, 0.6, 0.9, 1.0, 1.0, 0.9, 0.8, 0.6, 0.5],
  upland:   [0.5, 0.4, 0.3, 0.3, 0.6, 0.9, 1.0, 1.0, 0.9, 0.8, 0.6, 0.5],
  plain:    [0.5, 0.4, 0.3, 0.4, 0.7, 0.8, 0.8, 0.9, 1.0, 1.2, 1.2, 0.6], // stubble after the harvest
  mountain: [0.4, 0.3, 0.3, 0.3, 0.6, 0.9, 1.0, 1.0, 0.9, 0.7, 0.5, 0.4],
  desert:   [0.5, 0.4, 0.3, 0.4, 0.7, 1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5],
};
/** nutritional value of the grass by month: dry winter grass feeds less [S] */
export const PASTURE_QUALITY: readonly number[] = [0.6, 0.6, 0.6, 0.7, 1, 1, 1, 1, 1, 0.9, 0.7, 0.6];
/** area grazed from one camp, km²: about 10 km around it [S] */
export const GRAZING_AREA_KM2 = 300;
/** share of the grazed grass that grows back each day, April to September [S] */
export const REGROWTH_PER_DAY = 0.02;

// --- men and food ---
export const RATIONS_PER_SHEEP = 12; // [S] 15-20 kg of meat
export const RATIONS_PER_HORSE = 100; // [S] at full condition, half when starving
export const SHEEP_GRAZE_KG = 1.5; // [R] about a quarter of a horse
export const STARVATION_LOSS = 0.01; // [S] men lost per day without food

// --- cities and sieges ---
/** siege progress per day, out of 100: SIEGE_RATE x (men / garrison) / walls [S] */
export const SIEGE_RATE = 13;
/** engineers speed sieges up by this factor [S] */
export const ENGINEER_FACTOR = 2;
/** a city with walls at least this strong yields engineers when taken [S] */
export const ENGINEER_WALLS = 1.5;
/** men lost storming a city: garrison x walls x (1 - progress/100) x STORM_COST [S] */
export const STORM_COST = 0.11;
/** days of grain for the horses from a taken city with full stores [S] */
export const GRAIN_DAYS = 10;
/** most days of rations a column can carry away from a taken city [S] */
export const MAX_RATION_DAYS = 30;
/** with fewer men the column can no longer campaign: the game is lost [S] */
export const DEFEAT_MEN = 1000;
