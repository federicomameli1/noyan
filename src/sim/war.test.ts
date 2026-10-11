import { describe, expect, it } from "vitest";
import { luck, mulberry32, resolveBattle } from "./battle";
import { BATTLE_SEED, MONGOL_MORALE } from "./constants";
import { armyForce, battleInput, battleOdds, canAttack, columnForce, escapeSite, fight, newGame, orderAttack, orderFight, orderRefuse, orderSiege, refuseBlock, step, type GameState } from "./game";
import { jinDecide } from "./jin";
import { makeSave, readSave } from "./save";

const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };
const col = (s: GameState) => s.columns[0];
const army = (s: GameState) => s.jin[0];
const horse = (s: GameState) => s.jin[1];

/** A fed column and the Pingyang army face to face at Huozhou, on the plain, the army in plain sight. */
function faceToFace(): GameState {
  const s = newGame();
  Object.assign(col(s), { at: "huozhou", rations: 1e9 });
  Object.assign(army(s), { at: "huozhou", leg: null, route: [], order: "hold", target: null, sight: 3 });
  return s;
}

/**
 * A small fed column at Yuanping, a short ride from the frontier horsemen at Xinzhou.
 * The main column stays at Datong, so the campaign is not lost for lack of men.
 */
function weakColumn(men: number): GameState {
  const s = newGame();
  col(s).rations = 1e9;
  s.columns.push({ ...JSON.parse(JSON.stringify(col(s))), name: "Boru's detachment", at: "yuanping", men, horses: men * 4 });
  return s;
}
const small = (s: GameState) => s.columns[1];

describe("the player attacks", () => {
  it("fights the army standing with the column, as the battle rules say, and the beaten Jin go home", () => {
    const s = faceToFace();
    const next = mulberry32(BATTLE_SEED);
    const expected = resolveBattle({
      mongol: columnForce(col(s)), jin: armyForce(s, army(s)), ground: "plain", luck: { mongol: luck(next), jin: luck(next) },
    });
    const foot = army(s).foot, horses = col(s).horses;
    expect(orderAttack(s, 0)).toBe(true);
    const b = s.lastBattle!;
    expect(b.attacker).toBe("mongol");
    expect(b.site).toBe("huozhou");
    expect(b.result.outcome).toBe(expected.outcome);
    expect(col(s).men).toBe(3000 - Math.round(expected.mongolLosses.men));
    expect(col(s).horses).toBe(horses - Math.round(expected.mongolLosses.horses));
    expect(army(s).foot).toBe(foot - Math.round(expected.jinLosses.foot));
    expect(col(s).morale).toBe(MONGOL_MORALE + expected.morale.mongol);
    expect(["draw", "victory", "rout"]).toContain(expected.outcome);
    expect(army(s).order).toBe("return");
    expect(s.log.at(-1)!.kind).toBe("alert");
  });

  it("cannot attack an army the scouts cannot place, or no army at all", () => {
    const s = faceToFace();
    army(s).sight = 1;
    expect(canAttack(s, 0)).toBeNull();
    expect(orderAttack(s, 0)).toBe(false);
    army(s).at = "pingyang";
    army(s).sight = 3;
    expect(canAttack(s, 0)).toBeNull();
  });

  it("the same seed and the same orders give the same battle", () => {
    const a = faceToFace(), b = faceToFace();
    orderAttack(a, 0);
    orderAttack(b, 0);
    expect(a.lastBattle).toEqual(b.lastBattle);
    expect(a.rng).not.toBe(BATTLE_SEED);
  });

  it("a beaten column lifts its siege and stops", () => {
    const s = newGame();
    Object.assign(col(s), { at: "taiyuan", men: 1500, horses: 6000, condition: 15, rations: 1e9 });
    orderSiege(s, 0);
    Object.assign(army(s), { at: "taiyuan", leg: null, route: [], order: "hold", target: null });
    fight(s, 0, army(s), "jin");
    expect(["defeat", "disaster"]).toContain(s.lastBattle!.result.outcome);
    expect(col(s).siege).toBeNull();
    expect(col(s).halted).toBe(true);
  });
});

describe("a Jin army attacks", () => {
  it("the frontier horsemen fall upon a column of 500 men", () => {
    const s = weakColumn(500);
    days(s, 3);
    expect(s.lastBattle?.army).toBe(horse(s).name);
    expect(s.lastBattle?.attacker).toBe("jin");
    expect(s.log.some(l => l.text.startsWith(`The ${horse(s).name} attacks`) && l.kind === "alert")).toBe(true);
  });

  it("they leave the full column alone", () => {
    const s = weakColumn(3000);
    days(s, 3);
    expect(s.lastBattle).toBeNull();
  });

  it("they give up when the column they marched on grows too strong", () => {
    const s = weakColumn(500);
    jinDecide(s);
    expect(horse(s).order).toBe("attack");
    expect(horse(s).target).toBe("yuanping");
    Object.assign(small(s), { men: 3000, horses: 12000 });
    jinDecide(s);
    expect(horse(s).order).not.toBe("attack");
    days(s, 3);
    expect(s.lastBattle).toBeNull();
  });
});

describe("saves", () => {
  it("keep the column's morale and the dice after a battle", () => {
    const s = faceToFace();
    orderAttack(s, 0);
    const loaded = readSave(JSON.stringify(makeSave(s, 0))).game;
    expect(loaded.columns[0].morale).toBe(col(s).morale);
    expect(loaded.rng).toBe(s.rng);
    expect(loaded).toEqual(s);
  });
});

describe("a Jin army catches up with a column", () => {
  /** The frontier horsemen are upon a small detachment at Yuanping. */
  function caught(): GameState {
    const s = weakColumn(500);
    for (let i = 0; i < 24 * 3 && !s.threat; i++) step(s);
    return s;
  }

  it("stops the game and waits for the player's answer", () => {
    const s = caught();
    expect(s.threat).toMatchObject({ column: 1, army: 1 });
    expect(s.lastBattle).toBeNull();
    expect(s.log.at(-1)!.text).toContain("Stand and fight, or ride away");
    expect(s.log.at(-1)!.kind).toBe("alert");
  });

  it("the column can stand and fight", () => {
    const s = caught();
    expect(orderFight(s)).toBe(true);
    expect(s.threat).toBeNull();
    expect(s.lastBattle?.attacker).toBe("jin");
  });

  it("if time runs on without an answer, the column fights", () => {
    const s = caught();
    step(s);
    expect(s.threat).toBeNull();
    expect(s.lastBattle?.attacker).toBe("jin");
  });

  it("on good horses it can ride away, leaving its flock and its siege behind", () => {
    const s = caught();
    const c = small(s), site = c.at!;
    c.sheep = 400;
    expect(refuseBlock(s)).toBeNull();
    const to = escapeSite(s, c, horse(s));
    expect(orderRefuse(s)).toBe(true);
    expect(s.threat).toBeNull();
    expect(c.route).toEqual([to]);
    expect(c.pace).toBe("forced");
    expect(c.sheep).toBe(0);
    expect(s.sites[site].sheep).toBe(400);
    expect(s.lastBattle).toBeNull();
    days(s, 1);
    expect(c.at).not.toBe(site);
    expect(c.leg?.to ?? c.at).toBe(to);
  });

  it("on thin or tired horses it cannot", () => {
    const s = caught();
    small(s).condition = 30;
    expect(refuseBlock(s)).toContain("too thin");
    expect(orderRefuse(s)).toBe(false);
    small(s).condition = 60;
    small(s).fatigue = 70;
    expect(refuseBlock(s)).toContain("too tired");
  });
});

describe("the odds of a battle", () => {
  it("luck can only move the outcome as far as the best and the worst day", () => {
    const s = faceToFace();
    const { even, best, worst } = battleOdds(battleInput(s, col(s), army(s)));
    expect(best.ratio).toBeGreaterThan(even.ratio);
    expect(worst.ratio).toBeLessThan(even.ratio);
    orderAttack(s, 0);
    expect(s.lastBattle!.result.ratio).toBeGreaterThanOrEqual(worst.ratio);
    expect(s.lastBattle!.result.ratio).toBeLessThanOrEqual(best.ratio);
  });
});
