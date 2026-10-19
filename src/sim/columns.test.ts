import { describe, expect, it } from "vitest";
import { canSplit, companionColumn, maxSplit, orderMerge, orderSplit } from "./columns";
import { DEFEAT_MEN } from "./constants";
import { newGame, type GameState } from "./game";

const col = (s: GameState) => s.columns[0];

/** A column of `men` men standing at a place, with food and horses. */
function columnOf(men: number, at = "datong"): GameState {
  const s = newGame();
  Object.assign(col(s), { at, men, horses: men * 4, rations: men * 10, sheep: 0 });
  return s;
}

describe("dividing a column", () => {
  it("two halves of the same men, horses and food", () => {
    const s = columnOf(3000);
    expect(canSplit(col(s))).toBe(true);
    expect(orderSplit(s, 0, 1500)).toBe(true);
    expect(s.columns).toHaveLength(2);
    const [a, b] = s.columns;
    expect(a.men).toBe(1500);
    expect(b.men).toBe(1500);
    expect(b.horses).toBe(6000);
    expect(a.horses).toBe(6000);
    expect(b.rations).toBe(15000);
    expect(a.rations).toBe(15000);
    expect(b.at).toBe("datong");
    expect(b.name).not.toBe(a.name);
  });

  it("a column too small to be divided is left alone", () => {
    const s = columnOf(DEFEAT_MEN * 2);
    expect(canSplit(col(s))).toBe(false);
    expect(orderSplit(s, 0, 1000)).toBe(false);
    expect(s.columns).toHaveLength(1);
  });

  it("the part that goes away keeps at least a thousand men", () => {
    const s = columnOf(2500);
    expect(maxSplit(col(s))).toBe(1500);
    expect(orderSplit(s, 0, 2000)).toBe(true);
    expect(s.columns[1].men).toBe(1500);
    expect(col(s).men).toBe(1000);
  });

  it("a column on the road cannot be divided", () => {
    const s = columnOf(3000);
    col(s).at = null;
    col(s).leg = { from: "datong", to: "huairen", done: 10, km: 40 };
    expect(canSplit(col(s))).toBe(false);
    expect(orderSplit(s, 0, 1500)).toBe(false);
  });

  it("the new column has its own name, and a second split gets another", () => {
    const s = columnOf(6000);
    orderSplit(s, 0, 2000);
    orderSplit(s, 0, 1000);
    expect(new Set(s.columns.map(c => c.name)).size).toBe(3);
  });
});

describe("joining columns", () => {
  it("two columns at the same place become one, with everything they had", () => {
    const s = columnOf(3000);
    orderSplit(s, 0, 1000);
    const other = companionColumn(s, s.columns[0], 0);
    expect(other).toBe(1);
    expect(orderMerge(s, 0, other)).toBe(true);
    expect(s.columns).toHaveLength(1);
    expect(col(s).men).toBe(3000);
    expect(col(s).horses).toBe(12000);
    expect(col(s).rations).toBe(30000);
  });

  it("columns at different places cannot be joined", () => {
    const s = columnOf(3000);
    orderSplit(s, 0, 1000);
    s.columns[1].at = "huairen";
    expect(companionColumn(s, s.columns[0], 0)).toBe(-1);
    expect(orderMerge(s, 0, 1)).toBe(false);
    expect(s.columns).toHaveLength(2);
  });

  it("the spirit of the two is averaged by the men they have", () => {
    const s = columnOf(3000);
    orderSplit(s, 0, 1000);
    s.columns[0].morale = 100;
    s.columns[1].morale = 0;
    orderMerge(s, 0, 1);
    expect(col(s).morale).toBeCloseTo((100 * 2000 + 0 * 1000) / 3000);
  });

  it("the engineers of either column are kept", () => {
    const s = columnOf(3000);
    orderSplit(s, 0, 1000);
    s.columns[1].engineers = true;
    orderMerge(s, 0, 1);
    expect(col(s).engineers).toBe(true);
  });

  it("an answer waiting for the player follows the column that is left", () => {
    const s = columnOf(3000);
    orderSplit(s, 0, 1000);
    // the threat is upon the second column: after the join it is upon the first
    s.threat = { kind: "attack", column: 1, army: 0, hour: 0 };
    orderMerge(s, 0, 1);
    expect(s.threat?.column).toBe(0);
  });
});
