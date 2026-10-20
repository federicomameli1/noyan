// The playtest kit: scripted players, whole campaigns in a few lines, and turn-by-turn play.
// Used by scripts/playtest.mjs (the command line) and by the campaign tests.
export * from "./policies";
export * from "./run";
export * from "./digest";
export * from "./turn";
export { SCENARIO } from "../scenario";
export { newGame } from "../game";
