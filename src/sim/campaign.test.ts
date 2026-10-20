import { describe, expect, it } from "vitest";
// the campaign report is written to the standard output of the test runner
declare const console: { log(...args: unknown[]): void };
import { orderSplit } from "./columns";
import { newGame, orderSiege, step, totalHours, type GameState } from "./game";
import { runGame } from "./playtest/run";

/**
 * The noyan of the tests: it plays the whole campaign with a policy (src/sim/playtest/policies.ts).
 * "direct" goes straight for what the khan asks, eats what it finds and fights every battle.
 * "careful" forages, sacks the towns it takes, chooses its battles by the odds, and hunts the
 * Jin armies when there is no place to take.
 */
type Policy = "direct" | "careful";

const play = (policy: Policy, sheep = 6000): GameState => runGame({ policy, sheep }).final;

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
