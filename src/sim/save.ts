// Saved games. The game state is plain JSON, so a save is that state plus a few fields
// to recognise it. This file only builds and checks saves; where they are kept is up to the interface.
import { dateOf, type GameState } from "./game";
import { formatDate } from "./calendar";
import { SCENARIO } from "./scenario";

export const SAVE_FORMAT = "noyan-save";
/** raised when the shape of GameState changes, so old saves are refused instead of breaking the game */
export const SAVE_VERSION = 2;

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
    || !Array.isArray(g.jin) || g.jin.length !== SCENARIO.jin.length || !isObject(g.sites) || !isObject(g.cities) || !Array.isArray(g.log) || !isNumber(g.arrived) || typeof g.over !== "boolean") fail("The save is damaged.");
  const game = g as unknown as GameState;
  for (const c of game.columns) {
    if (!isObject(c) || typeof c.name !== "string" || !isNumber(c.men) || !isNumber(c.horses) || !isNumber(c.condition)
      || !Array.isArray(c.route) || !(c.at === null || SCENARIO.graph.sites.some(s => s.id === c.at))) fail("The save is damaged.");
  }
  // every place of the map must be there, and nothing else: a save of an older map would break the routes
  const siteIds = SCENARIO.graph.sites.map(s => s.id).sort().join();
  if (Object.keys(game.sites).sort().join() !== siteIds) fail("The save was made on a different map.");
  if (Object.keys(game.cities).sort().join() !== Object.keys(SCENARIO.cities).sort().join()) fail("The save was made on a different map.");

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
