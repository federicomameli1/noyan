// Saved games. The game state is plain JSON, so a save is that state plus a few fields
// to recognise it. This file only builds and checks saves; where they are kept is up to the interface.
import { dateOf, type GameState } from "./game";
import { formatDate } from "./calendar";
import { isEventId } from "./events";
import { SCENARIO } from "./scenario";

export const SAVE_FORMAT = "noyan-save";
/** raised when the shape of GameState changes, so old saves are refused instead of breaking the game */
export const SAVE_VERSION = 8;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  scenario: string;
  /** when the save was made, as an ISO string */
  savedAt: string;
  /** the column the player was giving orders to */
  active: number;
  game: GameState;
}

export function makeSave(game: GameState, active: number, savedAt = new Date()): SaveFile {
  return {
    format: SAVE_FORMAT, version: SAVE_VERSION, scenario: SCENARIO.name, savedAt: savedAt.toISOString(), active,
    game: JSON.parse(JSON.stringify(game)),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Checks a save read from storage or from a file. Returns it with a fresh copy of the game,
 * or throws an Error with a message the player can read.
 */
export function readSave(data: unknown): SaveFile {
  const fail = (why: string): never => { throw new Error(why); };
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { fail("This file is not a Noyan save."); }
  }
  if (!isObject(data) || data.format !== SAVE_FORMAT) fail("This file is not a Noyan save.");
  const d = data as Record<string, unknown>;
  if (d.version !== SAVE_VERSION) fail(`This save comes from another version of the game (save version ${String(d.version)}, game version ${SAVE_VERSION}).`);
  if (d.scenario !== SCENARIO.name) fail(`This save belongs to another scenario (${String(d.scenario)}).`);

  const g = d.game;
  if (!isObject(g) || !isNumber(g.hour) || g.hour < 0 || !Array.isArray(g.columns) || !g.columns.length
    || !Array.isArray(g.jin) || g.jin.length < SCENARIO.jin.length || g.jin.length > SCENARIO.jin.length + SCENARIO.jinReserves.length
    || !isNumber(g.jinArrived) || !Array.isArray(g.convoys) || !isNumber(g.convoyDay)
    || !isNumber(g.treasury) || !Array.isArray(g.remounts) || !isNumber(g.rng) || !isObject(g.sites) || !isObject(g.cities)
    || !Array.isArray(g.log) || !isNumber(g.arrived) || !isNumber(g.wins) || typeof g.over !== "boolean") fail("The save is damaged.");
  const game = g as unknown as GameState;
  for (const c of game.columns) {
    if (!isObject(c) || typeof c.name !== "string" || !isNumber(c.men) || !isNumber(c.horses) || !isNumber(c.condition) || !isNumber(c.morale)
      || !Array.isArray(c.route) || !(c.at === null || SCENARIO.graph.sites.some(s => s.id === c.at))) fail("The save is damaged.");
  }
  // a field army must know its food: saves made before the Jin were supplied have none
  for (const a of game.jin) {
    if (!isObject(a) || !isNumber(a.food)) fail("The save is damaged.");
  }
  if (Object.values(game.sites).some(st => !isObject(st) || !isNumber(st.food) || !isNumber(st.hostility) || !isNumber(st.herders) || !isNumber(st.remounts))) fail("The save is damaged.");
  // a city knows the hour it fell and the goods it still holds
  if (Object.values(game.cities).some(c => !isObject(c) || typeof c.taken !== "boolean" || typeof c.sacked !== "boolean" || !isNumber(c.booty) || (c.takenAt !== null && !isNumber(c.takenAt)))) fail("The save is damaged.");
  // the remounts on the road
  if (game.remounts.some(r => !isObject(r) || typeof r.site !== "string" || !isNumber(r.horses) || !isNumber(r.hour))) fail("The save is damaged.");
  // every place of the map must be there, and nothing else: a save of an older map would break the routes
  const siteIds = SCENARIO.graph.sites.map(s => s.id).sort().join();
  if (Object.keys(game.sites).sort().join() !== siteIds) fail("The save was made on a different map.");
  if (Object.keys(game.cities).sort().join() !== Object.keys(SCENARIO.cities).sort().join()) fail("The save was made on a different map.");

  // saves made before a Jin army could catch a column
  game.threat ??= null;
  if (game.threat && ((game.threat.kind !== "attack" && game.threat.kind !== "relief") || !isNumber(game.threat.column) || !game.columns[game.threat.column] || !isNumber(game.threat.army) || !game.jin[game.threat.army])) fail("The save is damaged.");
  // saves made before an event could wait for an answer
  if (!Array.isArray(game.eventsDone) || !game.eventsDone.every(k => typeof k === "string")) fail("The save is damaged.");
  const ev: unknown = game.event;
  if (ev !== null && !(isObject(ev) && isEventId(ev.id) && isNumber(ev.column) && !!game.columns[ev.column] && typeof ev.site === "string" && isNumber(ev.hour))) fail("The save is damaged.");
  const active = isNumber(d.active) && d.active >= 0 && d.active < game.columns.length ? Math.floor(d.active) : 0;
  return {
    format: SAVE_FORMAT, version: SAVE_VERSION, scenario: SCENARIO.name,
    savedAt: typeof d.savedAt === "string" ? d.savedAt : "", active,
    game: JSON.parse(JSON.stringify(game)),
  };
}

/** short description of a save for buttons: "12 Oct 1218, Muqali" */
export function describeSave(save: SaveFile): string {
  return `${formatDate(dateOf(save.game))}, ${save.game.columns.map(c => c.name).join(" and ")}`;
}

/** file name for an exported save */
export function saveFileName(save: SaveFile): string {
  const d = dateOf(save.game);
  return `noyan-${d.year}-${String(d.month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}.json`;
}
