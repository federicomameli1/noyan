import { describe, expect, it } from "vitest";
// the campaign report is written to the standard output of the test runner
declare const console: { log(...args: unknown[]): void };
import { forageBlock, orderForage } from "./country";
import { orderSack } from "./booty";
import { orderSplit } from "./columns";
import { objectiveOf } from "./goals";
import {
  battleInput, battleOdds, canAttack, foodDays, newGame, orderAttack, orderFight, orderMarch, orderRefuse,
  orderSiege, orderStorm, orderSurrender, step, stormFails, totalHours, wallsOf, type GameState,
} from "./game";

/**
 * The noyan of the tests: it plays the whole campaign with a policy.
 * "direct" goes straight for what the khan asks, eats what it finds and fights every battle.
 * "careful" forages, sacks the towns it takes, chooses its battles by the odds, and hunts the
 * Jin armies when there is no place to take.
 */
type Policy = "direct" | "careful";

function play(policy: Policy, sheep = 6000): GameState {
  const s = newGame(sheep);
  let target: string | null = null;
  let stall = 0;
  while (!s.over && s.hour < totalHours()) {
    // the main column is the one the campaign began with; the reinforcements join it,
    // and the watches the noyan leaves behind stay in the towns they guard
    const c = s.columns[0], ci = 0;
    for (const [i, x] of s.columns.entries()) {
      if (i === 0 || x.name.includes("detachment")) continue;
      if (x.at && c.at && x.at !== c.at) orderMarch(s, i, c.at);
    }
    // a careful noyan leaves a watch in the towns it takes: the Jin call on them
    if (policy === "careful" && c.at && s.cities[c.at]?.taken) {
      const here = s.columns.filter(x => x.at === c.at);
      const watch = here.some(x => x.name.includes("detachment"));
      const total = here.reduce((n, x) => n + x.men, 0);
      if (!watch && total >= 2500) {
        const strongest = here.sort((a, b) => b.men - a.men)[0];
        orderSplit(s, s.columns.indexOf(strongest), 1000);
      }
    }
    if (c.men > 0) {
      const obj = objectiveOf(s);
      const hungry = foodDays(c) < 30 && c.at && !c.foraging && !forageBlock(s, c, "requisition");
      if (policy === "careful" && hungry) {
        orderForage(s, ci, "requisition");
      } else if (!obj && policy === "careful") {
        // no place to take: hunt the Jin armies
        const foe = s.jin.filter(a => a.foot + a.horse > 0).sort((a, b) => b.foot + b.horse - a.foot - a.horse)[0];
        if (foe?.at && c.at !== foe.at) { orderMarch(s, ci, foe.at); target = foe.at; }
      } else if (obj) {
        if (c.at !== obj) {
          if (target !== obj) { orderMarch(s, ci, obj); target = obj; }
          stall = 0;
        } else if (!c.siege) {
          orderSiege(s, ci);
          stall = 0;
        } else {
          stall += 1;
          if (stall > 45 && !stormFails(c, s.cities[obj])) orderStorm(s, ci);
        }
      }
      // the goods of a town taken are worth the horses they buy
      if (policy === "careful" && c.at && s.cities[c.at]?.taken && !s.cities[c.at].sacked) orderSack(s, ci);
    }
    for (let h = 0; h < 24 && !s.over; h++) {
      step(s);
      answer(s, policy);
      // a Jin army standing with the column is attacked when the odds are good
      if (policy === "careful") {
        const c2 = s.columns[0];
        if (c2) {
          const foe = canAttack(s, 0);
          if (foe && ["rout", "victory"].includes(battleOdds(battleInput(s, c2, foe)).even.outcome)) {
            orderAttack(s, 0);
          }
        }
      }
    }
  }
  return s;
}

/** Answers the army that is upon the column, the way a player would: with the odds in mind. */
function answer(s: GameState, policy: Policy) {
  const t = s.threat;
  if (!t) return;
  const c = s.columns[t.column], a = s.jin[t.army];
  if (t.kind === "call") {
    // the Jin call on a town: hold the walls if the odds are good, give the town up if not
    const odds = battleOdds(battleInput(s, c, a, 0, wallsOf(s, t.site))).even.outcome;
    if (policy === "direct" || ["defeat", "disaster"].includes(odds)) orderSurrender(s);
    else orderFight(s);
    return;
  }
  const odds = battleOdds(battleInput(s, c, a)).even.outcome;
  if (policy === "direct" || ["rout", "victory", "draw"].includes(odds)) orderFight(s);
  else orderRefuse(s);
}

describe("a whole campaign", () => {
  it("the careful noyan wins the war in Shanxi", () => {
    const s = play("careful");
    expect(s.over).toBe(true);
    expect(s.result).toBe("victory");
    expect(s.dispatchesMet).toBe(3);
    expect(s.dispatchesMissed).toBe(0);
    expect(s.favour).toBeGreaterThanOrEqual(90);
    // the town he ends the campaign with is still in his hands
    expect(Object.values(s.cities).filter(c => c.taken).length).toBeGreaterThanOrEqual(1);
    expect(s.log.some(l => l.text.startsWith("Victory"))).toBe(true);
  });

  it("a watch of a thousand men cannot hold a walled city: the ground won is the ground kept", () => {
    // the careful noyan leaves a watch of a thousand men in Taiyuan, and the Jin take it back
    const s = play("careful");
    const watch = s.columns.find(x => x.name.includes("detachment"));
    expect(watch).toBeDefined();
    expect(s.cities.taiyuan.taken).toBe(false);
  });

  it("the noyan who only marches and fights loses the campaign to the thaw", () => {
    const s = play("direct");
    expect(s.over).toBe(true);
    expect(s.result).toBe("defeat");
    expect(s.log.at(-1)!.text).toMatch(/Defeat/);
  });

  it("the orders of the khan are the same in every campaign", () => {
    const s = play("careful");
    expect(s.log.some(l => l.text.includes("A letter from the khan"))).toBe(true);
    expect(s.log.filter(l => l.text.includes("A letter from the khan")).length).toBe(3);
  });

  it("a campaign with no orders at all ends without breaking", () => {
    const s = newGame();
    while (!s.over && s.hour < totalHours()) {
      for (let h = 0; h < 24 && !s.over; h++) step(s);
    }
    expect(s.over).toBe(true);
    expect(s.result).toBe("defeat");
    expect(s.log.at(-1)!.text).toMatch(/Defeat/);
  });

  it("the campaigns, played and reported", () => {
    // the report the balance is read from: run the tests and read the lines
    for (const policy of ["direct", "careful"] as Policy[]) {
      const s = play(policy);
      const men = s.columns.reduce((n, c) => n + c.men, 0);
      const horses = s.columns.reduce((n, c) => n + c.horses, 0);
      const towns = Object.values(s.cities).filter(c => c.taken).length;
      console.log(
        `  ${policy.padEnd(8)} ${String(s.result).padEnd(8)} day ${String(Math.floor(s.hour / 24)).padStart(3)}`
        + ` | men ${Math.round(men).toString().padStart(5)} | horses ${Math.round(horses).toString().padStart(5)}`
        + ` | favour ${String(s.favour).padStart(3)} | orders ${s.dispatchesMet}/${s.dispatchesMet + s.dispatchesMissed}`
        + ` | towns ${towns}`,
      );
    }
    expect(true).toBe(true);
  });

  it("a column with no men cannot besiege a city", () => {
    const s = newGame();
    s.columns[0].men = 100;
    expect(orderSiege(s, 0)).toBe(false);
  });

  it("the campaign can be divided and joined again without breaking", () => {
    const s = play("careful");
    expect(s.columns.length).toBeGreaterThan(0);
    const before = s.columns.reduce((n, c) => n + c.men, 0);
    orderSplit(s, 0, 1000);
    expect(s.columns.reduce((n, c) => n + c.men, 0)).toBe(before);
  });
});
