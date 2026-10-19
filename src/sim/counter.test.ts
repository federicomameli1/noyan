import { describe, expect, it } from "vitest";
import { HERDERS_RESERVE } from "./constants";
import { newGame, orderFight, orderSurrender, retakeCity, step, type GameState } from "./game";

const col = (s: GameState) => s.columns[0];
const army = (s: GameState) => s.jin[0];
const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };
/** Steps until the Jin army calls on the town, or the days are over. */
const untilThreat = (s: GameState) => { for (let i = 0; i < 12 * 24 && !s.threat; i++) step(s); };

/** A game where the Mongols hold Fenzhou and the Jin field army is marching on it. */
function calledOn(): GameState {
  const s = newGame();
  s.cities.fenzhou.taken = true;
  s.cities.fenzhou.booty = 2000;
  s.favour = 70;
  Object.assign(army(s), { at: "huozhou", leg: null, route: ["fenzhou"], order: "call", target: "fenzhou", sight: 3 });
  return s;
}

describe("a town taken back by the Jin", () => {
  it("goes back to the Jin when no column stands in it", () => {
    const s = calledOn();
    days(s, 8);
    expect(s.cities.fenzhou.taken).toBe(false);
    expect(s.cities.fenzhou.garrison).toBeGreaterThan(0);
    expect(s.favour).toBe(60);
    expect(s.log.some(l => l.text.includes("Fenzhou is taken back by the Jin"))).toBe(true);
  });

  it("loses its goods and the remounts waiting there", () => {
    const s = calledOn();
    s.sites.fenzhou.remounts = 200;
    days(s, 8);
    expect(s.cities.fenzhou.booty).toBe(0);
    expect(s.sites.fenzhou.remounts).toBe(0);
  });

  it("is called on when a column stands in it, and the player answers", () => {
    const s = calledOn();
    Object.assign(col(s), { at: "fenzhou", men: 5000, horses: 20000, rations: 1e9 });
    untilThreat(s);
    expect(s.threat?.kind).toBe("call");
    expect(s.cities.fenzhou.taken).toBe(true);
    expect(s.log.some(l => l.text.includes("calls on Fenzhou"))).toBe(true);
  });

  it("can be given up", () => {
    const s = calledOn();
    Object.assign(col(s), { at: "fenzhou", men: 5000, horses: 20000, rations: 1e9 });
    untilThreat(s);
    expect(orderSurrender(s)).toBe(true);
    expect(s.cities.fenzhou.taken).toBe(false);
    expect(s.favour).toBe(60);
    expect(s.threat).toBeNull();
  });

  it("can be held: the walls are worth the strength they give", () => {
    const s = calledOn();
    Object.assign(col(s), { at: "fenzhou", men: 5000, horses: 20000, condition: 90, fatigue: 0, rations: 1e9 });
    untilThreat(s);
    expect(s.threat?.kind).toBe("call");
    const men = col(s).men;
    expect(orderFight(s)).toBe(true);
    // the walls of a walled city are worth twice the men in the open
    expect(col(s).men).toBeGreaterThan(men - men * 0.25);
    expect(s.lastBattle!.result.outcome).not.toBe("disaster");
  });

  it("the town is lost when the defence fails", () => {
    const s = calledOn();
    // a garrison too weak to hold the walls, but still an army
    Object.assign(col(s), { at: "fenzhou", men: 1200, horses: 3000, condition: 5, fatigue: 100, rations: 1e9 });
    untilThreat(s);
    expect(s.threat?.kind).toBe("call");
    orderFight(s);
    expect(s.cities.fenzhou.taken).toBe(false);
  });

  it("a strong garrison keeps the Jin away from the town", () => {
    const s = calledOn();
    Object.assign(col(s), { at: "fenzhou", men: 8000, horses: 32000, condition: 90, fatigue: 0, rations: 1e9 });
    days(s, 8);
    // the Jin judge the walls too strong for them: they do not come
    expect(s.threat).toBeNull();
    expect(s.cities.fenzhou.taken).toBe(true);
  });

  it("a town the column has left is taken back when the army arrives", () => {
    const s = calledOn();
    // the column rides away before the army arrives
    Object.assign(col(s), { at: "huozhou", men: 5000, horses: 20000, rations: 1e9 });
    days(s, 8);
    expect(s.cities.fenzhou.taken).toBe(false);
    expect(s.log.some(l => l.text.includes("Fenzhou is taken back"))).toBe(true);
  });

  it("the retake can be done directly, when the game needs it", () => {
    const s = calledOn();
    retakeCity(s, "fenzhou", army(s));
    expect(s.cities.fenzhou.taken).toBe(false);
    expect(s.cities.fenzhou.garrison).toBe(Math.round((army(s).foot + army(s).horse) / 2));
  });
});

describe("the Jin raiders", () => {
  it("take the sheep of the allied herders, and the remount herds are smaller", () => {
    const s = newGame();
    s.sites.fengzhou.herders = HERDERS_RESERVE;
    const raider = s.jin[1]; // the frontier horse
    Object.assign(raider, { at: "datong", leg: null, route: ["fengzhou"], order: "raid", target: "fengzhou", sight: 3 });
    days(s, 10);
    expect(s.sites.fengzhou.herders).toBeLessThan(HERDERS_RESERVE);
    expect(s.log.some(l => l.text.includes("herders"))).toBe(true);
  });
});
