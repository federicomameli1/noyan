import { describe, expect, it } from "vitest";
import { newGame, orderMarch, step, type GameState } from "./game";
import { describeSave, makeSave, readSave, saveFileName } from "./save";

const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };

describe("saves", () => {
  it("a game saved and loaded goes on exactly as the original", () => {
    const a = newGame(1000);
    orderMarch(a, 0, "taiyuan");
    days(a, 5);
    const b = readSave(JSON.stringify(makeSave(a, 0))).game;
    expect(b).toEqual(a);
    days(a, 10);
    days(b, 10);
    expect(b).toEqual(a);
  });

  it("the loaded game is a copy, not the saved object", () => {
    const save = makeSave(newGame(), 0);
    const loaded = readSave(save);
    loaded.game.columns[0].men = 1;
    expect(save.game.columns[0].men).toBe(3000);
  });

  it("keeps the column the player had chosen, and falls back to the first", () => {
    const s = newGame();
    s.columns.push(JSON.parse(JSON.stringify(s.columns[0])));
    expect(readSave(makeSave(s, 1)).active).toBe(1);
    expect(readSave({ ...makeSave(s, 0), active: 7 }).active).toBe(0);
  });

  it("refuses files that are not saves, or are damaged, with a readable reason", () => {
    const good = makeSave(newGame(), 0);
    expect(() => readSave("not json")).toThrow("not a Noyan save");
    expect(() => readSave({ hello: 1 })).toThrow("not a Noyan save");
    expect(() => readSave({ ...good, version: 99 })).toThrow("another version");
    expect(() => readSave({ ...good, scenario: "Elsewhere" })).toThrow("another scenario");
    expect(() => readSave({ ...good, game: { ...good.game, columns: [] } })).toThrow("damaged");
    expect(() => readSave({ ...good, game: { ...good.game, columns: [{ ...good.game.columns[0], at: "atlantis" }] } })).toThrow("damaged");
    const { datong: _, ...sites } = good.game.sites;
    expect(() => readSave({ ...good, game: { ...good.game, sites } })).toThrow("different map");
  });

  it("names the save by the date in the game", () => {
    const s = newGame();
    days(s, 3);
    const save = makeSave(s, 0);
    expect(saveFileName(save)).toBe("noyan-1218-09-04.json");
    expect(describeSave(save)).toContain("Muqali");
  });
});
