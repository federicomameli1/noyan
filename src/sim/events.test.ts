import { describe, expect, it } from "vitest";
import * as R from "./constants";
import { forageBlock, orderForage } from "./country";
import { chooseEvent, eventView } from "./events";
import { dateOf, fight, newGame, orderMarch, step, type GameState } from "./game";
import { makeSave, readSave } from "./save";

const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };
const col = (s: GameState) => s.columns[0];

/** The column fed and standing at a place, Jin armies out of the way. */
function at(id: string): GameState {
  const s = newGame();
  s.jin = [];
  Object.assign(col(s), { at: id, rations: 10000 });
  return s;
}

describe("tribute", () => {
  it("is offered before the villages are plundered, and taking it spares them", () => {
    const s = at("yizhou"); // a contested city on the plain, with no Jin garrison near
    expect(forageBlock(s, col(s), "plunder")).toBeNull();
    const st = s.sites.yizhou;
    const before = { food: st.food, grain: st.grain, livestock: st.livestock, hostility: st.hostility };
    expect(orderForage(s, 0, "plunder")).toBe(true);
    expect(s.event).toMatchObject({ id: "tribute", column: 0, site: "yizhou" });
    expect(col(s).foraging).toBeNull();
    expect(s.log.at(-1)!.kind).toBe("alert");
    expect(eventView(s)!.choices).toHaveLength(2);
    expect(chooseEvent(s, 0)).toBe(true);
    expect(s.event).toBeNull();
    expect(s.eventsDone).toContain("tribute@yizhou");
    // a third of the stores goes to the column, the site keeps two thirds
    expect(col(s).rations).toBeCloseTo(10000 + before.food * R.TRIBUTE_SHARE);
    expect(col(s).sheep).toBeCloseTo(before.livestock * R.TRIBUTE_SHARE);
    expect(col(s).grain).toBeCloseTo((before.grain * R.TRIBUTE_SHARE) / col(s).horses);
    expect(st.food).toBeCloseTo(before.food * (1 - R.TRIBUTE_SHARE));
    expect(st.grain).toBeCloseTo(before.grain * (1 - R.TRIBUTE_SHARE));
    expect(st.livestock).toBeCloseTo(before.livestock * (1 - R.TRIBUTE_SHARE));
    expect(st.hostility).toBe(before.hostility - R.TRIBUTE_CALM);
    expect(st.burned).toBe(false);
  });

  it("sacking them anyway starts the plunder", () => {
    const s = at("yizhou");
    orderForage(s, 0, "plunder");
    expect(chooseEvent(s, 1)).toBe(true);
    expect(s.event).toBeNull();
    expect(col(s).foraging).toEqual({ kind: "plunder", until: s.hour + R.PLUNDER_DAYS * 24 });
  });

  it("goes ahead without asking again once it has been raised at a place", () => {
    const s = at("yizhou");
    orderForage(s, 0, "plunder");
    chooseEvent(s, 1);
    col(s).foraging = null;
    expect(orderForage(s, 0, "plunder")).toBe(true);
    expect(s.event).toBeNull();
    expect(col(s).foraging).not.toBeNull();
  });

  it("left unanswered while time runs, it takes its last choice", () => {
    const s = at("yizhou");
    orderForage(s, 0, "plunder");
    expect(s.event?.id).toBe("tribute");
    step(s); // the hour it was raised: nobody has answered yet
    expect(s.event).not.toBeNull();
    step(s); // time runs on: the event answers itself
    expect(s.event).toBeNull();
    expect(s.eventsDone).toContain("tribute@yizhou");
    expect(col(s).foraging).not.toBeNull(); // the last choice lets the plunder go ahead
  });
});

describe("frost", () => {
  /** A fed column standing at a mountain place, in November. */
  function november(id: string): GameState {
    const s = newGame();
    s.jin = [];
    Object.assign(col(s), { at: id, rations: 1e9 });
    s.hour = 70 * 24;
    return s;
  }

  it("falls on a mountain camp in November, and resting keeps the column where it is", () => {
    const s = november("jingle");
    expect(dateOf(s).month).toBe(10);
    orderMarch(s, 0, "taiyuan");
    step(s);
    expect(s.event).toMatchObject({ id: "frost", column: 0, site: "jingle" });
    col(s).fatigue = 50;
    expect(chooseEvent(s, 0)).toBe(true);
    expect(col(s).fatigue).toBe(50 - R.FROST_REST);
    const restUntil = col(s).restUntil;
    expect(restUntil).toBe(s.hour + 24);
    // resting: 23 hours later the column has not moved, and still has its route
    for (let i = 0; i < 23; i++) step(s);
    expect(col(s).at).toBe("jingle");
    expect(col(s).leg).toBeNull();
    expect(col(s).restUntil).toBe(restUntil);
    expect(col(s).route).toEqual(["taiyuan"]);
    // enough more: it takes the road again
    days(s, 4);
    expect(col(s).at !== "jingle" || col(s).leg !== null).toBe(true);
  });

  it("marching on through the cold costs condition", () => {
    const s = november("ningwu");
    step(s);
    expect(s.event?.id).toBe("frost");
    const condition = col(s).condition;
    expect(chooseEvent(s, 1)).toBe(true);
    expect(col(s).condition).toBe(condition - R.FROST_COLD);
    expect(col(s).restUntil).toBe(0);
  });

  it("comes only once, however long the column stays in the mountains", () => {
    const s = november("jingle");
    step(s);
    expect(chooseEvent(s, 1)).toBe(true);
    expect(s.eventsDone).toContain("frost");
    days(s, 5);
    expect(s.event).toBeNull();
  });
});

describe("herd", () => {
  /** A column at Huozhou with a weak Jin army in front of it: the Mongols win. */
  function won(): GameState {
    const s = newGame();
    Object.assign(col(s), { at: "huozhou", rations: 1e9 });
    const a = s.jin[0];
    Object.assign(a, { at: "huozhou", leg: null, route: [], order: "hold", target: null, sight: 3, foot: 300, horse: 0, quality: 0.6, morale: 20 });
    fight(s, 0, a, "mongol");
    return s;
  }

  it("leaves loose horses to round up after a victory", () => {
    const s = won();
    expect(["rout", "victory"]).toContain(s.lastBattle!.result.outcome);
    expect(s.event).toMatchObject({ id: "herd", column: 0, site: "huozhou" });
    const horses = col(s).horses, condition = col(s).condition;
    expect(chooseEvent(s, 0)).toBe(true);
    expect(col(s).horses).toBe(horses + R.HERD_HORSES);
    // the thin horses water down the condition of the whole herd
    expect(col(s).condition).toBeCloseTo((condition * horses + R.HERD_CONDITION * R.HERD_HORSES) / (horses + R.HERD_HORSES));
    expect(col(s).condition).toBeLessThan(condition);
    expect(col(s).restUntil).toBe(s.hour + 12);
  });

  it("can be left to run with nothing lost", () => {
    const s = won();
    const horses = col(s).horses, condition = col(s).condition;
    expect(chooseEvent(s, 1)).toBe(true);
    expect(col(s).horses).toBe(horses);
    expect(col(s).condition).toBe(condition);
    expect(col(s).restUntil).toBe(0);
  });
});

describe("event saves", () => {
  it("a game with a pending event survives save and load", () => {
    const s = newGame();
    Object.assign(col(s), { at: "yizhou", rations: 10000 });
    orderForage(s, 0, "plunder");
    expect(s.event).not.toBeNull();
    const loaded = readSave(JSON.stringify(makeSave(s, 0))).game;
    expect(loaded).toEqual(s);
    expect(loaded.event).toEqual(s.event);
    expect(loaded.eventsDone).toEqual(s.eventsDone);
  });

  it("refuses a save that has lost or spoilt its events", () => {
    const good = makeSave(newGame(), 0);
    expect(() => readSave({ ...good, game: { ...good.game, eventsDone: undefined } })).toThrow("damaged");
    expect(() => readSave({ ...good, game: { ...good.game, event: undefined } })).toThrow("damaged");
    expect(() => readSave({ ...good, game: { ...good.game, event: { id: "unknown", column: 0, site: "yizhou", hour: 0 } } })).toThrow("damaged");
    expect(() => readSave({ ...good, game: { ...good.game, event: { id: "frost", column: 9, site: "jingle", hour: 0 } } })).toThrow("damaged");
  });
});
