// The journal: the lines the player reads in the menu, and the notices that pause the game.
// Kept in its own module, with no runtime dependency on the rest of the simulation, so that
// the files that only write to it do not have to know the whole game.

import type { GameState } from "./game";

export interface LogEntry {
  hour: number;
  text: string;
  /** entries the player should not miss: arrivals and alerts pause the game, warnings do not */
  kind?: "arrival" | "alert" | "warning";
}

/** Writes a line in the journal. */
export function log(s: GameState, text: string, kind?: LogEntry["kind"]) {
  s.log.push(kind ? { hour: s.hour, text, kind } : { hour: s.hour, text });
}
