// Every tunable number of the rules lives here.
// Design notes and sources: brainstorming docs "03-regole-strato-0" (layer 0) and
// "07-regole-strato-1" (battles) in the project files.
// Tags: [D] documented, [R] modern estimate, [S] game estimate, to be tuned by playing.

import type { ConditionBand } from "./game";
import type { Control, Terrain } from "./world";

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
/** men lost storming a city: garrison x walls x (1 - progress/100) x STORM_COST [S] */
export const STORM_COST = 0.11;
/** most days of rations a column can carry away from a taken city [S] */
export const MAX_RATION_DAYS = 30;
/** with fewer men the column can no longer campaign: the game is lost [S] */
export const DEFEAT_MEN = 1000;

export type CityType = "town" | "walled" | "fortress";

export interface CityTypeRules {
  /** strength of the walls: siege progress is divided by it, storm losses multiplied [S] */
  walls: number;
  /** days of grain for the horses from its granaries, with full stores [S] */
  grainDays: number;
  /** its craftsmen join the column as engineers */
  engineers: boolean;
  /** share of the garrison that joins the column when the place falls to a siege, not to a storm [S] */
  recruits: number;
  /** while it holds, no column can march through it */
  blocks: boolean;
  /** its garrison sallies out against a column that marches past without leaving a blockade */
  sorties: boolean;
}

/** Three kinds of Jin strongholds, each with its own difficulty and reward. */
export const CITY_TYPES: Record<CityType, CityTypeRules> = {
  // county seat with earthen walls: falls fast, a supply stop
  town: { walls: 1, grainDays: 10, engineers: false, recruits: 0, blocks: false, sorties: false },
  // prefecture seat with brick walls: slow, but its workshops give engineers
  walled: { walls: 2, grainDays: 10, engineers: true, recruits: 0, blocks: false, sorties: true },
  // fort holding a mountain pass: small garrison behind strong walls, it closes the road
  fortress: { walls: 5, grainDays: 0, engineers: false, recruits: 0.4, blocks: true, sorties: false },
};

/** a sortie kills this share of the garrison's number in the column's men [S] */
export const SORTIE_MEN = 0.05;
/** and takes this share of the column's flock [S] */
export const SORTIE_SHEEP = 0.2;
/** men a blockade needs, as a share of the garrison it keeps inside the walls [S] */
export const BLOCKADE_MEN = 0.2;

// --- Jin armies (layer 1) ---
/** hours a day a Jin army marches, starting with the Mongol columns [S] */
export const JIN_MARCH_HOURS = 8;
/**
 * How far the scouts of a column see a Jin army, km [S]: that an army is there and roughly how big,
 * its exact place and size to the thousand, and everything (foot, horse, morale, where it is going).
 */
export const SIGHT_KM = { presence: 120, size: 60, full: 30 } as const;
/** scouts on exhausted horses ride half as far [S] */
export const SIGHT_EXHAUSTED = 0.5;
/** a Jin army notices a column this close, km [S] */
export const JIN_SIGHT_KM = 40;
/** Jin horsemen hear of a flock left this far from them or from a Jin town, km [S] */
export const JIN_FLOCK_SIGHT_KM = 60;
/** days of food a relief army brings into the city it reaches [S] */
export const RELIEF_STORES = 20;
/** size bands of a Jin army seen from far away, men: up to `small` is small, up to `medium` medium [S] */
export const ARMY_SIZE = { small: 2000, medium: 6000 } as const;

// --- battles (layer 1) ---
// A Mongol column against a Jin army. Rules: design doc "07-regole-strato-1", section 4.
/** fighting value of each troop type [S] */
export const TROOP_VALUE = { mongolHorse: 1.0, jinHorse: 0.7, jinFoot: 0.4 };
/** strength of the horses by the condition of the herd [S] */
export const HORSE_STRENGTH: Record<ConditionBand, number> = { fat: 1.1, fit: 1, thin: 0.75, exhausted: 0.45 };
/** fatigue above which the horses count as tired [S] */
export const TIRED_HORSES_FATIGUE = 60;
/** and the tired horses' extra penalty [S] */
export const TIRED_HORSES_FACTOR = 0.8;

/** where a battle is fought: any terrain of the map, or a pass along the way */
export type Ground = Terrain | "pass";

// the ground: horsemen want open land, footmen broken land. The desert is not in the
// design doc: open like the steppe for horsemen, thirst and soft sand for footmen [S]
export const GROUND_HORSE: Record<Ground, number> = { steppe: 1.2, plain: 1.2, desert: 1.2, upland: 1, mountain: 0.8, pass: 0.7 };
export const GROUND_FOOT: Record<Ground, number> = { steppe: 1, plain: 1, desert: 0.9, upland: 1.1, mountain: 1.2, pass: 1.4 };

/** strength is multiplied by MORALE_BASE + morale/100 [S] */
export const MORALE_BASE = 0.5;
/** morale of a Mongol column, when it is not given [S] */
export const MONGOL_MORALE = 70;
/** multiplier for the side that takes the other by surprise [S] */
export const SURPRISE = 1.4;
/** luck of the day, a factor drawn between these bounds [S] */
export const LUCK_MIN = 0.9;
export const LUCK_SPAN = 0.2;

export type BattleOutcome = "rout" | "victory" | "draw" | "defeat" | "disaster";

export interface OutcomeRule {
  /** least ratio of Mongol to Jin strength that ends the battle this way */
  min: number;
  /** share of their men that each side loses [S] */
  mongolLosses: number;
  jinLosses: number;
}

/** what becomes of a battle, by the ratio of the strengths, best for the Mongols first [S] */
export const OUTCOMES: readonly (OutcomeRule & { id: BattleOutcome })[] = [
  { min: 2, id: "rout", mongolLosses: 0.03, jinLosses: 0.4 },
  { min: 1.25, id: "victory", mongolLosses: 0.08, jinLosses: 0.25 },
  { min: 0.8, id: "draw", mongolLosses: 0.12, jinLosses: 0.12 },
  { min: 0.5, id: "defeat", mongolLosses: 0.25, jinLosses: 0.08 },
  { min: 0, id: "disaster", mongolLosses: 0.45, jinLosses: 0.03 },
];

/** extra share of their men the Jin lose when the Mongols ride the fugitives down [S] */
export const PURSUIT_LOSSES = 0.15;
/** share of the losses the Mongols save by falling back in good order, with horses able to run [S] */
export const RETREAT_RELIEF = 1 / 3;
/** Mongol horses lost for every man [S] */
export const HORSES_LOST_PER_MAN = 2;
/** how morale moves after a battle [S] */
export const MORALE_WIN = 10;
export const MORALE_LOSS = -20;
/** the loser's change after a rout or a disaster [S] */
export const MORALE_ROUT = -35;
/** the campaign's first throw of the dice: every battle's luck is drawn from this seed [S] */
export const BATTLE_SEED = 1218;
/** a Jin army attacks when it judges itself at least this strong against a column [S] */
export const JIN_ATTACK_RATIO = 1.3;
/** a Jin army whose morale falls below this has had enough: it goes home [S] */
export const JIN_RETREAT_MORALE = 30;
/** a column can ride away from a Jin army only on horses in better condition than this [S] */
export const REFUSE_MIN_CONDITION = 40;
/** and less tired than this [S] */
export const REFUSE_MAX_FATIGUE = 60;

// --- sieges with enemies (layer 1) ---
/** a garrison fighting outside its walls: quality and spirit [S] */
export const GARRISON_QUALITY = 1;
export const GARRISON_MORALE = 50;
/** share of the garrison that sallies, when it judges itself JIN_ATTACK_RATIO times stronger than the besiegers [S] */
export const SALLY_SHARE = 0.5;
/** share of the garrison that comes out to help a relief army fight the besiegers [S] */
export const RELIEF_GARRISON_SHARE = 0.25;

// --- the countryside: requisition and plunder (layer 1) ---
/** what the villages of a place hold after the harvest, for each level of population (0-3) [S] */
export const COUNTRY_FOOD = 6000; // rations: two days for the starting column, per level
export const COUNTRY_GRAIN = 12000; // horse-days of grain: a day for the starting herd, per level
export const COUNTRY_LIVESTOCK = 300; // head, counted as sheep
/** in winter the villagers eat their stores and hide the rest: share lost each month [S] */
export const WINTER_LOSS = 0.15;
export const WINTER_MONTHS: readonly number[] = [10, 11, 0, 1, 2]; // November to March
/** requisition: a day, a quarter of the food and grain, a little anger [S] */
export const REQUISITION_DAYS = 1;
export const REQUISITION_SHARE = 0.25;
export const REQUISITION_HOSTILITY = 5;
/** plunder: two days, most of everything and the livestock, the fields burned, much anger [S] */
export const PLUNDER_DAYS = 2;
export const PLUNDER_SHARE = 0.8;
export const PLUNDER_HOSTILITY = 25;
/** hostility of the villagers at the start, by who holds the land [S] */
export const HOSTILITY_START: Record<Control, number> = { mongols: 0, contested: 15, jin: 30, xixia: 0 };
/** share of the anger that spreads to the places around [S] */
export const HOSTILITY_SPILL = 0.5;
/** points of hostility lost each day, down to where it started [S] */
export const HOSTILITY_COOLING = 1;
/** above this the villagers hide their food: requisition brings half [S] */
export const HIDE_HOSTILITY = 50;
/** above this they steal horses at night: share of the herd [S] */
export const THEFT_HOSTILITY = 70;
export const HORSE_THEFT = 0.002;
/** share of the meat that can be eaten when a whole flock is slaughtered at once [S] */
export const SLAUGHTER_SHARE = 0.5;

// --- allied herders ---
/** sheep each allied pasture holds at the start and at most [S] */
export const HERDERS_RESERVE = 2500;
/** sheep per day the reserve grows back, up to HERDERS_RESERVE [S] */
export const HERDERS_REGROW = 40;

// --- events at places (layer 2) ---
/** share of the villages' stores the elders offer to be spared [S] */
export const TRIBUTE_SHARE = 1 / 3;
/** points of hostility the villages lose when the tribute is taken [S] */
export const TRIBUTE_CALM = 10;
/** a day by the fires recovers this much fatigue [S] */
export const FROST_REST = 20;
/** marching on through a hard frost costs this much condition [S] */
export const FROST_COLD = 5;
/** thin Jin horses the Mongols round up after a victory [S] */
export const HERD_HORSES = 400;
/** condition of the horses rounded up off the battlefield [S] */
export const HERD_CONDITION = 30;
/** hostility of the villagers below which a farmer offers to guide the column by a hidden path [S] */
export const GUIDES_HOSTILITY = 40;
/** chance the guide is a Jin trap [S] */
export const GUIDES_TRAP = 0.3;
/** km of the road the hidden path saves [S] */
export const GUIDES_KM = 40;
/** share of the men and horses lost in the ambush when the guide is a trap [S] */
export const GUIDES_LOSS = 0.03;
/** morale the ambush costs the column [S] */
export const GUIDES_MORALE = 10;
/** Khitan horsemen of a beaten army who ask to serve the Mongols [S] */
export const DESERTERS_MEN = 200;
/** and the horses they bring [S] */
export const DESERTERS_HORSES = 400;
/** condition of their horses, as for the ones rounded up off a battlefield [S] */
export const DESERTERS_CONDITION = 50;
/** morale lost when they are taken in: they are not trusted yet [S] */
export const DESERTERS_MORALE = 5;
/** places of the Fen valley where the winter ice can be crossed [S] */
export const ICE_SITES: readonly string[] = ["yuanping", "xinzhou", "taiyuan", "fenzhou", "huozhou", "pingyang"];
/** km of the road crossing the frozen Fen saves [S] */
export const ICE_KM = 60;
/** chance the ice breaks under part of the herd [S] */
export const ICE_RISK = 0.1;
/** share of the horses lost when it does [S] */
export const ICE_LOSS = 0.02;
