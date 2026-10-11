import { describe, expect, it } from "vitest";
import { luck, mulberry32, resolveBattle, strength, type BattleInput } from "./battle";

/** The battle the rules are written around: 3,000 Mongol horsemen against a Jin field army. */
const battle = (over: Partial<BattleInput> = {}): BattleInput => ({
  mongol: { men: 3000, condition: 50, fatigue: 20 },
  jin: { foot: 6500, horse: 1500, quality: 1, morale: 50 },
  ground: "plain",
  ...over,
});

describe("strength", () => {
  it("works out the example of the rules, Jin horsemen included", () => {
    const s = strength(battle());
    expect(s.mongol).toBeCloseTo(4320, 6);
    // 1,500 Jin horsemen on the plain ride the ground too: 1,500 x 0.7 x 1.2 over the footmen
    expect(s.jin).toBeCloseTo(3860, 6);
  });

  it("tired horses fight a fifth worse", () => {
    const fresh = strength(battle()).mongol;
    const tired = strength(battle({ mongol: { men: 3000, condition: 50, fatigue: 80 } })).mongol;
    expect(tired).toBeCloseTo(fresh * 0.8, 6);
  });

  it("walls double the strength of an army standing in a city", () => {
    const s = strength(battle({ jin: { foot: 6500, horse: 1500, quality: 1, morale: 50, walls: 2 } }));
    expect(s.jin).toBeCloseTo(7720, 6);
  });
});

describe("outcome and losses", () => {
  it("even armies on the plain fight to a draw", () => {
    const r = resolveBattle(battle());
    expect(r.ratio).toBeCloseTo(1.12, 2);
    expect(r.outcome).toBe("draw");
    expect(r.mongolLosses.men).toBeCloseTo(360, 6); // 12% of the column
    expect(r.mongolLosses.horses).toBeCloseTo(720, 6); // two horses for every man
    expect(r.jinLosses.foot).toBeCloseTo(780, 6); // 960 men, split by their numbers
    expect(r.jinLosses.horse).toBeCloseTo(180, 6);
    expect(r.morale).toEqual({ mongol: 0, jin: 0 });
  });

  it("surprise turns the draw into a victory, and the Mongols ride the fugitives down", () => {
    const r = resolveBattle(battle({ mongol: { men: 3000, condition: 50, fatigue: 20, surprise: true } }));
    expect(r.ratio).toBeCloseTo(1.57, 2);
    expect(r.outcome).toBe("victory");
    expect(r.mongolLosses.men).toBeCloseTo(240, 6); // 8%
    expect(r.jinLosses.foot + r.jinLosses.horse).toBeCloseTo(3200, 6); // 25%, plus 15% caught in the pursuit
    expect(r.morale).toEqual({ mongol: 10, jin: -20 });
  });

  it("in a pass the footmen hold the ground: defeat, softened by an orderly retreat", () => {
    const r = resolveBattle(battle({ ground: "pass" }));
    expect(r.ratio).toBeCloseTo(0.58, 2);
    expect(r.outcome).toBe("defeat");
    expect(r.mongolLosses.men).toBeCloseTo(500, 6); // 25%, cut by a third with fit horses
    expect(r.mongolLosses.horses).toBeCloseTo(1000, 6);
    expect(r.jinLosses.foot + r.jinLosses.horse).toBeCloseTo(640, 6); // 8%
    expect(r.morale).toEqual({ mongol: -20, jin: 10 });
  });

  it("thin horses and flagging morale: a defeat with no clean retreat", () => {
    const r = resolveBattle(battle({ mongol: { men: 3000, condition: 30, fatigue: 20, morale: 50 } }));
    expect(r.ratio).toBeCloseTo(0.7, 2);
    expect(r.outcome).toBe("defeat");
    expect(r.mongolLosses.men).toBeCloseTo(750, 6); // thin horses cannot cover the retreat
  });

  it("spent horses win without a pursuit and lose without a relief", () => {
    const won = resolveBattle(battle({ mongol: { men: 8000, condition: 10, fatigue: 20 } }));
    expect(won.outcome).toBe("victory");
    expect(won.jinLosses.foot + won.jinLosses.horse).toBeCloseTo(2000, 6); // no pursuit
    const lost = resolveBattle(battle({ mongol: { men: 3000, condition: 10, fatigue: 20 } }));
    expect(lost.outcome).toBe("defeat");
    expect(lost.mongolLosses.men).toBeCloseTo(750, 6); // no relief
  });

  it("a rout scatters the Jin army and breaks their morale", () => {
    const r = resolveBattle(battle({ jin: { foot: 650, horse: 150, quality: 1, morale: 50 } }));
    expect(r.outcome).toBe("rout");
    expect(r.mongolLosses.men).toBeCloseTo(90, 6); // 3%
    expect(r.jinLosses.foot + r.jinLosses.horse).toBeCloseTo(440, 6); // 40%, plus the pursuit
    expect(r.morale).toEqual({ mongol: 10, jin: -35 });
  });

  it("a disaster is worst of all", () => {
    const r = resolveBattle(battle({ mongol: { men: 300, condition: 10, fatigue: 20 } }));
    expect(r.outcome).toBe("disaster");
    expect(r.mongolLosses.men).toBeCloseTo(135, 6); // 45%
    expect(r.morale).toEqual({ mongol: -35, jin: 10 });
  });
});

describe("luck", () => {
  it("a lucky day turns the plain draw into a victory", () => {
    const r = resolveBattle(battle({ luck: { mongol: 1.1, jin: 0.9 } }));
    expect(r.ratio).toBeCloseTo(1.37, 2);
    expect(r.outcome).toBe("victory");
  });

  it("an unlucky one does not turn it into a defeat", () => {
    expect(resolveBattle(battle({ luck: { mongol: 0.9, jin: 1.1 } })).outcome).toBe("draw");
  });

  it("the same seed draws the same luck", () => {
    const three = (seed: number) => { const next = mulberry32(seed); return [luck(next), luck(next), luck(next)]; };
    expect(three(1218)).toEqual(three(1218));
    expect(three(1218)).not.toEqual(three(1219));
    for (const l of three(7)) {
      expect(l).toBeGreaterThanOrEqual(0.9);
      expect(l).toBeLessThan(1.1);
    }
  });
});

describe("factors", () => {
  it("puts the ground first in a pass", () => {
    const r = resolveBattle(battle({ ground: "pass" }));
    expect(r.factors.length).toBeLessThanOrEqual(4);
    // the Jin side is mostly foot: 6,500 x 0.4 x 1.4 and 1,500 x 0.7 x 0.7, over what they are worth on even ground
    expect(r.factors[0].factor).toBe("ground");
    expect(r.factors[0].mongol).toBe(0.7);
    expect(r.factors[0].jin).toBeCloseTo(4375 / 3650, 6);
  });

  it("leaves out the factors that weighed on neither side", () => {
    const r = resolveBattle(battle());
    expect(r.factors.map(f => f.factor).sort()).toEqual(["ground", "morale"]);
  });

  it("blames the walls when the Jin stand in a city", () => {
    const r = resolveBattle(battle({ jin: { foot: 6500, horse: 1500, quality: 1, morale: 50, walls: 2 } }));
    expect(r.factors[0].factor).toBe("walls");
  });
});
