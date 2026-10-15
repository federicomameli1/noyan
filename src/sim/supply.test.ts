import { describe, expect, it } from "vitest";
import { CONVOY_EVERY, CONVOY_FOOD, CONVOY_GRAIN_DAYS, CONVOY_RATIONS_SHARE, HUNGER_DESERTION, HUNGER_MORALE, JIN_FOOD_DAYS, MAX_RATION_DAYS } from "./constants";
import { newGame, step, type GameState } from "./game";
import { armyMen, jinDecide } from "./jin";
import { makeSave, readSave } from "./save";

const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };
const col = (s: GameState) => s.columns[0];
const army = (s: GameState) => s.jin[0];

/** Puts the field army at a site, with nothing to do. */
function place(s: GameState, i: number, id: string) {
  Object.assign(s.jin[i], { at: id, leg: null, route: [], order: "hold", target: null });
}

describe("food in the field", () => {
  it("a field army at home keeps full food; moved into the field it loses one day's food a day", () => {
    const s = newGame();
    expect(army(s).food).toBe(JIN_FOOD_DAYS);
    days(s, 1);
    expect(army(s).food).toBe(JIN_FOOD_DAYS);
    place(s, 0, "huozhou"); // a junction, no city, not its home
    days(s, 1);
    expect(army(s).food).toBe(JIN_FOOD_DAYS - 1);
    days(s, 1);
    expect(army(s).food).toBe(JIN_FOOD_DAYS - 2);
  });

  it("an army with no food loses spirit and men, and falls back below thirty morale", () => {
    const s = newGame();
    const a = army(s);
    a.home = "fenzhou"; // a city, so its fall is not the reason for the retreat
    place(s, 0, "huozhou");
    a.food = 0;
    const foot = a.foot, horse = a.horse, morale = a.morale;
    jinDecide(s);
    expect(a.food).toBe(0);
    expect(a.morale).toBe(morale - HUNGER_MORALE);
    expect(a.foot).toBe(foot - Math.round(foot * HUNGER_DESERTION));
    expect(a.horse).toBe(horse - Math.round(horse * HUNGER_DESERTION));
    for (let i = 0; i < 10 && a.order !== "return"; i++) jinDecide(s);
    expect(a.order).toBe("return");
  });
});

describe("convoys", () => {
  it("set out every five days, travel at about 15 km a day and refill the army on arrival", () => {
    const s = newGame();
    place(s, 0, "huozhou");
    const a = army(s);
    days(s, CONVOY_EVERY - 1);
    expect(s.convoys).toHaveLength(0);
    days(s, 1);
    expect(s.convoys).toHaveLength(1);
    const cv = s.convoys[0];
    expect(cv.army).toBe(0);
    expect(cv.at).toBe("pingyang");
    expect(cv.food).toBe(CONVOY_FOOD);
    days(s, 1);
    expect(cv.leg!.done).toBeCloseTo(15, 0); // CONVOY_KM_PER_DAY on a road
    for (let i = 0; i < 20 && s.convoys.includes(cv); i++) days(s, 1);
    expect(s.convoys).not.toContain(cv);
    // refilled on arrival: at most one night's ration has been eaten since
    expect(a.food).toBeGreaterThanOrEqual(JIN_FOOD_DAYS - 1);
  });

  it("are not sent once the army's home city has been taken", () => {
    const s = newGame();
    army(s).home = "fenzhou";
    place(s, 0, "huozhou");
    s.cities.fenzhou.taken = true;
    days(s, CONVOY_EVERY);
    expect(s.convoys).toHaveLength(0);
  });

  it("are captured by a column on the road: it takes the food and the army goes hungry", () => {
    const s = newGame();
    Object.assign(col(s), { at: "pingyang", rations: 100 });
    place(s, 0, "huozhou");
    days(s, CONVOY_EVERY);
    expect(s.convoys).toHaveLength(1);
    const cv = s.convoys[0];
    const rations = col(s).rations, grain = col(s).grain;
    days(s, 1 / 24); // the convoy sets out at Pingyang, where the column stands
    expect(s.convoys).not.toContain(cv);
    expect(col(s).rations).toBe(rations + CONVOY_FOOD * armyMen(army(s)) * CONVOY_RATIONS_SHARE);
    expect(col(s).grain).toBe(grain + CONVOY_GRAIN_DAYS);
    expect(s.log.some(l => l.text.includes("falls on a Jin supply convoy") && l.kind === "arrival")).toBe(true);
    let warned = false;
    for (let i = 0; i < 30 && !warned; i++) { days(s, 1); warned = s.log.some(l => l.text.includes("going hungry")); }
    expect(warned).toBe(true);
  });

  it("are stopped and captured by a column standing at a place on their road", () => {
    const s = newGame();
    Object.assign(col(s), { at: "huozhou", rations: 100 });
    s.cities.fenzhou.taken = true; // a taken city does not feed the army: it is in the field there
    place(s, 0, "fenzhou");
    days(s, CONVOY_EVERY);
    expect(s.convoys).toHaveLength(1);
    let captured = false;
    for (let h = 0; h < 30 * 24 && !captured; h++) {
      step(s);
      captured = s.log.some(l => l.text.includes("falls on a Jin supply convoy near Huozhou"));
    }
    expect(captured).toBe(true);
    expect(army(s).food).toBeLessThan(JIN_FOOD_DAYS);
  });

  it("give the column no more rations than it can carry", () => {
    const s = newGame();
    Object.assign(col(s), { at: "pingyang", rations: col(s).men * MAX_RATION_DAYS - 50 });
    place(s, 0, "huozhou");
    days(s, CONVOY_EVERY + 1 / 24);
    expect(s.convoys).toHaveLength(0);
    expect(col(s).rations).toBeLessThanOrEqual(col(s).men * MAX_RATION_DAYS);
  });
});

describe("saves", () => {
  it("keep the convoys and the food of the field armies", () => {
    const s = newGame();
    place(s, 0, "huozhou");
    days(s, CONVOY_EVERY + 1);
    expect(s.convoys.length).toBeGreaterThan(0);
    expect(readSave(JSON.stringify(makeSave(s, 0))).game).toEqual(s);
  });

  it("treat a save without convoys, or without an army's food, as damaged", () => {
    const good = makeSave(newGame(), 0);
    const { convoys: _c, ...noConvoys } = good.game;
    expect(() => readSave({ ...good, game: noConvoys })).toThrow("damaged");
    const jin = good.game.jin.map(a => { const { food: _f, ...rest } = a; return rest; });
    expect(() => readSave({ ...good, game: { ...good.game, jin } })).toThrow("damaged");
  });
});
