import { describe, expect, it } from "vitest";
import { bootyOf, mongolGround, orderRemounts, orderSack, remountsAffordable, stepBooty } from "./booty";
import { HORSE_PRICE, REMOUNT_DAYS, SACK_HOSTILITY } from "./constants";
import { newGame, orderSiege, step, type GameState } from "./game";

const col = (s: GameState) => s.columns[0];
const hours = (s: GameState, n: number) => { for (let i = 0; i < n; i++) step(s); };
const days = (s: GameState, n: number) => hours(s, n * 24);

/** A column that has taken Daizhou, with the town emptied of its garrison. */
function afterTaking(s: GameState, id: string): GameState {
  const s2 = newGame();
  Object.assign(col(s2), { at: id, men: 5000, horses: 10000, rations: 1e9 });
  orderSiege(s2, 0);
  for (let i = 0; i < 60 * 24 && !s2.cities[id].taken; i++) step(s2);
  s2.over = false;
  s2.result = null;
  return s2;
}

describe("booty", () => {
  it("a fallen town holds goods, and sacking them fills the treasury", () => {
    const s = afterTaking(newGame(), "daizhou");
    expect(s.cities.daizhou.taken).toBe(true);
    expect(s.cities.daizhou.booty).toBe(bootyOf(s.cities.daizhou.garrison));
    expect(s.treasury).toBe(0);
    expect(orderSack(s, 0)).toBe(true);
    expect(s.treasury).toBe(s.cities.daizhou.garrison * 2);
    expect(s.cities.daizhou.booty).toBe(0);
    // a town can be sacked only once
    expect(orderSack(s, 0)).toBe(false);
  });

  it("sacking a town makes the countryside around it angry", () => {
    const s = afterTaking(newGame(), "daizhou");
    const before = s.sites.daizhou.hostility;
    orderSack(s, 0);
    expect(s.sites.daizhou.hostility).toBeGreaterThan(before);
    expect(s.sites.daizhou.hostility - before).toBeLessThanOrEqual(SACK_HOSTILITY);
  });

  it("a town that still holds cannot be sacked", () => {
    const s = newGame();
    Object.assign(col(s), { at: "daizhou" });
    expect(orderSack(s, 0)).toBe(false);
  });
});

describe("remounts", () => {
  it("goods buy horses, and the horses come in a few days", () => {
    const s = newGame();
    s.treasury = 2000;
    expect(remountsAffordable(s)).toBe(100);
    expect(orderRemounts(s, 0, 100)).toBe(true);
    expect(s.treasury).toBe(0);
    expect(s.remounts).toHaveLength(1);
    // the column is at Datong, a place the Mongols hold
    expect(s.remounts[0].site).toBe("datong");
    const horses = col(s).horses;
    hours(s, REMOUNT_DAYS * 24 + 1);
    expect(col(s).horses).toBe(horses + 100);
    expect(s.remounts).toHaveLength(0);
  });

  it("the herds cannot graze where the Jin hold the ground", () => {
    const s = newGame();
    Object.assign(col(s), { at: "taiyuan" });
    s.treasury = 2000;
    expect(mongolGround(s, "taiyuan")).toBe(false);
    expect(orderRemounts(s, 0, 100)).toBe(false);
    expect(s.treasury).toBe(2000);
  });

  it("a town taken by the Mongols is ground the herds can graze", () => {
    const s = newGame();
    s.cities.daizhou.taken = true;
    s.treasury = 2000;
    Object.assign(col(s), { at: "daizhou" });
    expect(mongolGround(s, "daizhou")).toBe(true);
    expect(orderRemounts(s, 0, 100)).toBe(true);
  });

  it("no goods, no horses", () => {
    const s = newGame();
    expect(remountsAffordable(s)).toBe(0);
    expect(orderRemounts(s, 0, 100)).toBe(false);
  });

  it("the treasury buys no more than it can pay for", () => {
    const s = newGame();
    s.treasury = 205;
    expect(remountsAffordable(s)).toBe(10);
    orderRemounts(s, 0, 100);
    expect(s.treasury).toBe(205 - 10 * HORSE_PRICE);
  });

  it("remounts that arrive where no column stands wait for one", () => {
    const s = newGame();
    s.treasury = 2000;
    orderRemounts(s, 0, 100);
    // the column leaves before the herds arrive
    Object.assign(col(s), { at: "fengzhou" });
    hours(s, REMOUNT_DAYS * 24 + 1);
    expect(s.sites.datong.remounts).toBe(100);
    expect(col(s).horses).toBe(12000);
    // a column that comes to that place takes them
    Object.assign(col(s), { at: "datong" });
    stepBooty(s);
    expect(col(s).horses).toBe(12100);
    expect(s.sites.datong.remounts).toBe(0);
  });
});
