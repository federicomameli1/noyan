import { describe, expect, it } from "vitest";
import { AIMS, aimMet, decisiveAimMet } from "./goals";
import { fight, newGame, orderSiege, step, type GameState } from "./game";
import { SCENARIO } from "./scenario";

const col = (s: GameState) => s.columns[0];
const aim = (id: string) => AIMS.find(a => a.id === id)!;

/** A column at Taiyuan with everything it needs, besieging the city. */
function atTaiyuan(): GameState {
  const s = newGame();
  Object.assign(col(s), { at: "taiyuan", men: 20000, horses: 40000, rations: 1e9 });
  orderSiege(s, 0);
  return s;
}

describe("the war aims", () => {
  it("the campaign is won when the decisive aim is met", () => {
    const s = atTaiyuan();
    expect(aimMet(s, aim("capital"))).toBe(false);
    expect(decisiveAimMet(s)).toBeNull();
    // the siege goes on until the city falls
    for (let i = 0; i < 40 * 24 && !s.over; i++) step(s);
    expect(s.cities.taiyuan.taken).toBe(true);
    expect(s.result).toBe("victory");
    expect(decisiveAimMet(s)).toBe(aim("capital"));
  });

  it("the city remembers the hour it fell", () => {
    const s = atTaiyuan();
    for (let i = 0; i < 40 * 24 && !s.over; i++) step(s);
    expect(s.cities.taiyuan.takenAt).toBe(s.hour);
  });

  it("towns taken are counted for the aim", () => {
    const s = newGame();
    expect(aimMet(s, aim("cities"))).toBe(false);
    s.cities.daizhou.taken = true;
    s.cities.yuanping.taken = true;
    expect(aimMet(s, aim("cities"))).toBe(false);
    s.cities.yuci.taken = true;
    expect(aimMet(s, aim("cities"))).toBe(true);
  });

  it("a Jin army broken in the open is counted", () => {
    const s = newGame();
    expect(aimMet(s, aim("rout"))).toBe(false);
    Object.assign(col(s), { at: "huozhou", men: 30000, horses: 60000, condition: 90, fatigue: 0, rations: 1e9 });
    Object.assign(s.jin[0], { at: "huozhou", leg: null, route: [], order: "hold", sight: 3 });
    fight(s, 0, s.jin[0], "mongol");
    expect(s.wins).toBe(1);
    expect(aimMet(s, aim("rout"))).toBe(true);
  });

  it("the aims judged at the end count only when the campaign is over", () => {
    const s = newGame();
    expect(aimMet(s, aim("roster"))).toBe(false);
    expect(aimMet(s, aim("roster"), true)).toBe(true);
    expect(aimMet(s, aim("horses"), true)).toBe(true);
    col(s).men = 100;
    expect(aimMet(s, aim("roster"), true)).toBe(false);
  });

  it("every aim says how it stands", () => {
    const s = newGame();
    expect(aim("capital").status(s)).toBe("still standing");
    expect(aim("cities").status(s)).toBe("0 of 3 cities taken");
    expect(aim("rout").status(s)).toBe("no army broken yet");
    s.cities.taiyuan.progress = 42;
    expect(aim("capital").status(s)).toBe("besieged, 42%");
  });

  it("the decisive aim is the only one that ends the war", () => {
    expect(AIMS.filter(a => a.decisive)).toHaveLength(1);
    expect(aim("capital").decisive).toBe(true);
    expect(aim("capital").name).toContain(SCENARIO.graph.site(SCENARIO.objective).name);
  });
});
