import { describe, expect, it } from "vitest";
import { dropFlock, effectivePace, newGame, orderHalt, orderMarch, orderSiege, orderStorm, planRoute, setPace, siegeDays, step, stormCost, takeFlock, type GameState } from "./game";
import { RATIONS_PER_SHEEP, type PaceId } from "./constants";

const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };
const col = (s: GameState) => s.columns[0];

/** A game where food never runs out, to look at the horses alone. */
function fed(pace: PaceId, skipDays = 0, at?: string): GameState {
  const s = newGame();
  s.hour = skipDays * 24;
  if (at) col(s).at = at;
  col(s).rations = 1e9;
  setPace(s, 0, pace);
  return s;
}

describe("marching", () => {
  it("reaches Taiyuan from Datong in about two weeks at the normal pace, with horses in shape", () => {
    const s = fed("normal");
    orderMarch(s, 0, "taiyuan");
    days(s, 16);
    expect(col(s).at).toBe("taiyuan");
    expect(col(s).condition).toBeGreaterThan(80);
    expect(col(s).horses).toBe(12000);
  });

  it("forced marching pays off for a few days, then kills horses", () => {
    const arrival = (pace: PaceId, dest: string) => {
      const s = fed(pace);
      orderMarch(s, 0, dest);
      let d = 0;
      while (col(s).at !== dest) { days(s, 1); d++; }
      return d;
    };
    // a short dash: forced is clearly faster
    expect(arrival("forced", "daizhou")).toBeLessThan(arrival("normal", "daizhou"));
    // a long march: tired horses slow down and forced gains nothing
    expect(arrival("forced", "zhongdu")).toBeGreaterThanOrEqual(arrival("normal", "zhongdu"));
    const s = fed("forced");
    orderMarch(s, 0, "zhending");
    days(s, 14);
    expect(col(s).horses).toBeLessThan(12000 * 0.9);
  });

  it("a flock forces the grazing pace, which keeps the horses fat", () => {
    const s = newGame(3000);
    setPace(s, 0, "forced");
    expect(effectivePace(col(s))).toBe("grazing");
    orderMarch(s, 0, "taiyuan");
    days(s, 10);
    expect(col(s).at).not.toBe("taiyuan");
    expect(col(s).condition).toBeGreaterThan(85);
    expect(col(s).fatigue).toBeLessThan(20);
  });

  it("fewer remounts tire the horses faster", () => {
    const four = fed("normal"), two = fed("normal");
    col(two).horses = 6000;
    orderMarch(four, 0, "zhongdu");
    orderMarch(two, 0, "zhongdu");
    for (let i = 0; i < 12; i++) { step(four); step(two); } // until midday of the first march
    expect(col(two).fatigue).toBeGreaterThan(col(four).fatigue * 1.3);
  });

  it("estimates the days of a route close to what the march takes", () => {
    const s = fed("normal");
    const plan = planRoute(col(s), "taiyuan")!;
    expect(plan.sites.at(-1)).toBe("taiyuan");
    orderMarch(s, 0, "taiyuan");
    let hours = 0;
    while (col(s).at !== "taiyuan") { step(s); hours++; }
    expect(Math.abs(plan.days - hours / 24)).toBeLessThan(1);
  });

  it("halts halfway along a link and can turn back", () => {
    const s = fed("normal");
    orderMarch(s, 0, "huairen");
    for (let i = 0; i < 9; i++) step(s);
    orderHalt(s, 0);
    const done = col(s).leg!.done;
    days(s, 1);
    expect(col(s).leg!.done).toBe(done);
    expect(planRoute(col(s), "datong")!.turnBack).toBe(true);
    orderMarch(s, 0, "datong");
    days(s, 1);
    expect(col(s).at).toBe("datong");
  });
});

describe("pasture", () => {
  it("a winter siege without moving wears the horses down", () => {
    const s = fed("normal", 100, "taiyuan"); // from 10 December
    days(s, 30);
    expect(col(s).condition).toBeLessThan(40);
    expect(s.sites.taiyuan.grazed).toBeGreaterThan(1000);
  });

  it("winter on the steppe costs less than a winter siege in the plain", () => {
    const steppe = fed("normal", 100, "xijing-pastures"), plain = fed("normal", 100, "taiyuan");
    days(steppe, 30);
    days(plain, 30);
    expect(col(steppe).condition).toBeGreaterThan(col(plain).condition + 20);
  });
});

describe("food", () => {
  it("eats personal rations first, then sheep, then horses", () => {
    const s = newGame(300);
    days(s, 20);
    expect(col(s).rations).toBe(0);
    expect(col(s).sheep).toBe(300);
    days(s, 1);
    expect(col(s).sheep).toBeCloseTo(300 - 3000 / RATIONS_PER_SHEEP);
    days(s, 2);
    expect(col(s).sheep).toBe(0);
    expect(col(s).horses).toBeLessThan(12000);
    expect(col(s).men).toBe(3000);
  });

  it("men starve when nothing is left", () => {
    const s = newGame();
    col(s).horses = 0;
    days(s, 22);
    expect(col(s).men).toBeLessThan(3000);
    expect(s.log.some(l => l.text.includes("starving"))).toBe(true);
  });

  it("a flock can be left at a site and taken back", () => {
    const s = newGame(3000);
    expect(dropFlock(s, 0)).toBe(true);
    expect(col(s).sheep).toBe(0);
    expect(effectivePace(col(s))).toBe("normal");
    expect(takeFlock(s, 0)).toBe(true);
    expect(col(s).sheep).toBe(3000);
  });
});

describe("sieges", () => {
  /** a fed column standing at a city */
  const at = (id: string) => fed("normal", 0, id);

  it("a small town falls in a few days and gives food and grain", () => {
    const s = at("daizhou");
    col(s).rations = 3000 * 5;
    expect(orderSiege(s, 0)).toBe(true);
    days(s, 3);
    expect(s.cities.daizhou.taken).toBe(true);
    expect(col(s).siege).toBeNull();
    expect(col(s).rations / 3000).toBeGreaterThan(10); // about 37 days of a 1,000-man garrison's food
    expect(col(s).grain).toBeGreaterThan(0);
    expect(col(s).engineers).toBe(false); // weak walls, no engineers
  });

  it("Taiyuan takes about 11 weeks without engineers and half with them", () => {
    const s = at("taiyuan");
    expect(siegeDays(col(s), s.cities.taiyuan)).toBeGreaterThanOrEqual(75);
    expect(siegeDays(col(s), s.cities.taiyuan)).toBeLessThanOrEqual(80);
    col(s).engineers = true;
    expect(siegeDays(col(s), s.cities.taiyuan)).toBeLessThanOrEqual(40);
  });

  it("a stronger town yields engineers", () => {
    const s = at("xinzhou");
    orderSiege(s, 0);
    days(s, 7);
    expect(s.cities.xinzhou.taken).toBe(true);
    expect(col(s).engineers).toBe(true);
  });

  it("storming costs men, less when the siege is advanced, and wins at Taiyuan", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    const fresh = stormCost(s.cities.taiyuan);
    days(s, 50); // about two thirds of the way
    const later = stormCost(s.cities.taiyuan);
    expect(later).toBeLessThan(fresh);
    orderStorm(s, 0);
    expect(col(s).men).toBe(3000 - later);
    expect(s.result).toBe("victory");
    expect(s.over).toBe(true);
  });

  it("a long winter siege at Taiyuan starves the horses", () => {
    const s = fed("normal", 90, "taiyuan"); // from 30 November
    orderSiege(s, 0);
    days(s, 35);
    expect(s.cities.taiyuan.taken).toBe(false);
    expect(col(s).condition).toBeLessThan(40);
  });

  it("marching away lifts the siege but keeps the progress", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    days(s, 5);
    const progress = s.cities.taiyuan.progress;
    orderMarch(s, 0, "yuci");
    expect(col(s).siege).toBeNull();
    expect(s.cities.taiyuan.progress).toBe(progress);
  });
});

describe("end of the game", () => {
  it("is lost when spring comes and Taiyuan still stands", () => {
    const s = newGame();
    days(s, 211);
    expect(s.over).toBe(true);
    expect(s.result).toBe("defeat");
  });

  it("is lost when the column falls under 1,000 men", () => {
    const s = fed("normal", 0, "taiyuan");
    col(s).men = 4500;
    orderSiege(s, 0);
    orderStorm(s, 0); // about 3,300 men lost
    expect(s.result).toBe("victory"); // the city falls before the count
    const t = fed("normal", 0, "fenzhou");
    col(t).men = 1300;
    orderSiege(t, 0);
    orderStorm(t, 0); // 440 men lost, 860 left: the storm fails
    expect(t.cities.fenzhou.taken).toBe(false);
    expect(t.result).toBe("defeat");
  });
});
