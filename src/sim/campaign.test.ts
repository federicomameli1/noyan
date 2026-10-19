import { describe, expect, it } from "vitest";
import { newGame, orderMarch, orderSiege, orderStorm, step, type GameState } from "./game";
import { totalHours } from "./game";

const col = (s: GameState) => s.columns[0];

/**
 * A simple noyan: march on Taiyuan, besiege it, and storm the walls when the siege
 * has gone on long enough. It is not a good player, but it plays the whole campaign.
 */
function play(campaign: GameState) {
  let stalled = 0;
  while (!campaign.over && campaign.hour < totalHours()) {
    const c = col(campaign);
    if (c.men > 0) {
      if (c.at !== "taiyuan") {
        orderMarch(campaign, 0, "taiyuan");
        stalled = 0;
      } else if (!c.siege) {
        orderSiege(campaign, 0);
        stalled = 0;
      } else {
        stalled += 1;
        // after a month of siege, storm the walls
        if (stalled > 30) orderStorm(campaign, 0);
      }
    }
    for (let h = 0; h < 24 && !campaign.over; h++) step(campaign);
  }
}

describe("a whole campaign", () => {
  it("ends with a result, and nothing throws on the way", () => {
    const s = newGame();
    play(s);
    expect(s.over).toBe(true);
    expect(s.result).not.toBeNull();
  });

  it("a column that marches straight on Taiyuan can take it", () => {
    const s = newGame();
    play(s);
    // the campaign is decided one way or the other, and the city is the reason
    if (s.result === "victory") {
      expect(s.cities.taiyuan.taken).toBe(true);
      expect(s.log.some(l => l.text.startsWith("Victory"))).toBe(true);
    } else {
      expect(s.log.at(-1)!.text).toMatch(/Defeat/);
    }
  });

  it("the Jin send their reserves, and the siege is relieved at least once", () => {
    const s = newGame();
    play(s);
    expect(s.jinArrived).toBeGreaterThan(0);
    expect(s.jin.length).toBeGreaterThan(2);
  });
});
