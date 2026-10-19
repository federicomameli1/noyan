import { describe, expect, it } from "vitest";
import * as R from "./constants";
import { formatDate } from "./calendar";
import { AIMS, DISPATCHES, aimMet, currentAim, currentDispatch, deadlineHour, dispatchTime, favourText } from "./goals";
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
  it("the city remembers the hour it fell", () => {
    const s = atTaiyuan();
    for (let i = 0; i < 40 * 24 && !s.cities.taiyuan.taken; i++) step(s);
    expect(s.cities.taiyuan.taken).toBe(true);
    expect(s.cities.taiyuan.takenAt).toBe(s.hour);
  });

  it("cities taken are counted for the aim", () => {
    const s = newGame();
    expect(aimMet(s, aim("hold"), true)).toBe(false);
    s.cities.daizhou.taken = true;
    s.cities.yuanping.taken = true;
    expect(aimMet(s, aim("hold"), true)).toBe(true);
  });

  it("a Jin army broken in the open is counted", () => {
    const s = newGame();
    expect(aimMet(s, aim("army"))).toBe(false);
    Object.assign(col(s), { at: "huozhou", men: 30000, horses: 60000, condition: 90, fatigue: 0, rations: 1e9 });
    Object.assign(s.jin[0], { at: "huozhou", leg: null, route: [], order: "hold", sight: 3 });
    fight(s, 0, s.jin[0], "mongol");
    expect(s.wins).toBe(1);
    expect(aimMet(s, aim("army"))).toBe(true);
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
    expect(aim("hold").status(s)).toBe("0 cities in Mongol hands");
    expect(aim("army").status(s)).toBe("no army broken yet");
    s.cities.taiyuan.progress = 42;
    expect(aim("capital").status(s)).toBe("besieged, 42%");
  });
});

describe("the khan's orders", () => {
  it("the campaign starts with the first letter", () => {
    const s = newGame();
    expect(s.dispatch).toBe(0);
    expect(currentDispatch(s)!.aim).toBe("capital");
    expect(currentAim(s)!.id).toBe("capital");
    expect(s.favour).toBe(70);
    expect(s.log.some(l => l.text.includes("A letter from the khan"))).toBe(true);
  });

  it("taking the city fulfils the order, and the next letter comes", () => {
    const s = atTaiyuan();
    for (let i = 0; i < 40 * 24 && s.dispatch === 0; i++) step(s);
    expect(s.dispatch).toBe(1);
    expect(s.dispatchesMet).toBe(1);
    expect(s.favour).toBe(80);
    expect(currentAim(s)!.id).toBe("army");
    expect(s.log.some(l => l.text.includes("A letter from the khan") && l.text.includes("second letter"))).toBe(true);
    // the campaign is not over: the khan has more orders
    expect(s.over).toBe(false);
  });

  it("an order not fulfilled in time is missed, and the khan is angry", () => {
    const s = newGame();
    // the thaw comes before the first order is done
    for (let i = 0; i < 24 * 24 * 8 && s.dispatch === 0 && !s.over; i++) step(s);
    expect(s.dispatch).toBe(1);
    expect(s.dispatchesMissed).toBe(1);
    expect(s.favour).toBe(55);
    expect(s.log.some(l => l.text.includes("not fulfilled in time"))).toBe(true);
  });

  it("the last order fulfilled wins the campaign", () => {
    const s = newGame();
    s.dispatch = DISPATCHES.length - 1;
    s.cities.fenzhou.taken = true;
    step(s);
    expect(s.over).toBe(true);
    expect(s.result).toBe("victory");
    expect(s.log.some(l => l.text.startsWith("Victory"))).toBe(true);
  });

  it("the favour running out ends the campaign", () => {
    const s = newGame();
    s.favour = 5;
    s.hour = 24 * 24 * 400; // long after the first order was due
    step(s);
    expect(s.dispatchesMissed).toBe(1);
    expect(s.favour).toBeLessThan(0);
    expect(s.over).toBe(true);
    expect(s.result).toBe("defeat");
    expect(s.log.some(l => l.text.includes("called back"))).toBe(true);
  });

  it("an order is judged at the end of the day it is due, not at midnight", () => {
    const s = newGame();
    const due = DISPATCHES[0].deadline;
    // the last hour of the day the order is due: still time
    s.hour = deadlineHour(DISPATCHES[0]) - 1;
    step(s);
    expect(s.dispatchesMissed).toBe(0);
    // the first hour of the next day: the order is lost
    s.hour = deadlineHour(DISPATCHES[0]);
    step(s);
    expect(s.dispatchesMissed).toBe(1);
    expect(s.dispatchResults[0]).toBe("missed");
    expect(formatDate(due)).toBe("31 December 1218");
  });

  it("says how many days are left for the order", () => {
    const s = newGame();
    const t = dispatchTime(s);
    expect(t.due).toBe("31 December 1218");
    expect(t.left).toBeGreaterThan(100);
    expect(favourText(s)).toContain("satisfied");
    s.favour = 30;
    expect(favourText(s)).toContain("not pleased");
    s.favour = 10;
    expect(favourText(s)).toContain("anger");
  });

  it("the three orders are due one after the other, the last before the thaw", () => {
    expect(DISPATCHES.map(d => d.aim)).toEqual(["capital", "army", "south"]);
    const last = DISPATCHES[DISPATCHES.length - 1];
    expect(last.deadline).toEqual(R.DEADLINE_SOUTH);
    // the last order is due before the thaw, so it can be missed
    expect(last.deadline).not.toEqual(SCENARIO.end);
  });
});
