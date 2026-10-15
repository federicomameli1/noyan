import { describe, expect, it } from "vitest";
import { randomStep } from "./battle";
import * as R from "./constants";
import { forageBlock, orderForage } from "./country";
import { chooseEvent, eventView } from "./events";
import { dateOf, fight, jumpAhead, newGame, orderMarch, step, type GameState } from "./game";
import { makeSave, readSave } from "./save";

const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };
const col = (s: GameState) => s.columns[0];

/** The first rng state whose next draw satisfies the test, to force the dice of an event. */
function seedWhere(test: (v: number) => boolean): number {
  for (let seed = 0; seed < 1e6; seed++) if (test(randomStep(seed).value)) return seed;
  throw new Error("no seed found");
}

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

describe("guides", () => {
  /** A fed column at Hunyuan, its route on by the mountain path to Lingqiu and beyond. */
  function guiding(): GameState {
    const s = at("hunyuan");
    col(s).route = ["lingqiu", "laiyuan", "zijing"];
    return s;
  }

  it("is offered by a farmer where the road turns into the mountains", () => {
    const s = guiding();
    step(s);
    expect(dateOf(s).month).toBe(8); // September: no frost, no ice
    expect(s.event).toMatchObject({ id: "guides", column: 0, site: "hunyuan" });
    expect(s.log.at(-1)!.kind).toBe("alert");
    expect(eventView(s)!.choices).toHaveLength(2);
  });

  it("a trap costs men, horses and morale, and the column stays where it is", () => {
    const s = guiding();
    step(s);
    s.rng = seedWhere(v => v < R.GUIDES_TRAP);
    const men = col(s).men, horses = col(s).horses, morale = col(s).morale;
    expect(chooseEvent(s, 0)).toBe(true);
    expect(col(s).men).toBe(men - Math.round(men * R.GUIDES_LOSS));
    expect(col(s).horses).toBe(horses - Math.round(horses * R.GUIDES_LOSS));
    expect(col(s).morale).toBe(morale - R.GUIDES_MORALE);
    expect(col(s).at).toBe("hunyuan");
    expect(col(s).leg).toBeNull();
    expect(col(s).route).toEqual(["lingqiu", "laiyuan", "zijing"]);
  });

  it("a true guide saves about 40 km of the road along the hidden path", () => {
    const s = guiding();
    step(s);
    s.rng = seedWhere(v => v >= R.GUIDES_TRAP);
    expect(chooseEvent(s, 0)).toBe(true);
    // the mountain path covers less ground than the road it saves: 40 km of marching, not of ground
    expect(col(s).at).toBeNull();
    expect(col(s).leg).toMatchObject({ from: "hunyuan", to: "lingqiu" });
    expect(col(s).leg!.done / R.LINKS.mountain.speed).toBeCloseTo(R.GUIDES_KM, 0);
    expect(col(s).route).toEqual(["laiyuan", "zijing"]);
  });

  it("keeping to the road changes nothing", () => {
    const s = guiding();
    step(s);
    const before = JSON.parse(JSON.stringify(col(s)));
    expect(chooseEvent(s, 1)).toBe(true);
    expect(col(s)).toEqual(before);
  });

  it("does not come back at the same place", () => {
    const s = guiding();
    step(s);
    s.rng = seedWhere(v => v < R.GUIDES_TRAP); // the trap: the column stays at Hunyuan
    chooseEvent(s, 0);
    expect(s.eventsDone).toContain("guides@hunyuan");
    step(s);
    expect(s.event).toBeNull();
  });
});

describe("deserters", () => {
  /** A column at Huozhou with a weak Jin army in front of it: the Mongols win. */
  function won(): GameState {
    const s = newGame();
    Object.assign(col(s), { at: "huozhou", rations: 1e9 });
    const a = s.jin[0];
    Object.assign(a, { at: "huozhou", leg: null, route: [], order: "hold", target: null, sight: 3, foot: 300, horse: 0, quality: 0.6, morale: 20 });
    fight(s, 0, a, "mongol");
    return s;
  }

  it("Khitan horsemen ask to serve right after the victory is answered", () => {
    const s = won();
    expect(s.event?.id).toBe("herd");
    chooseEvent(s, 1); // let the loose horses go
    step(s);
    expect(s.event).toMatchObject({ id: "deserters", column: 0, site: "huozhou" });
    const men = col(s).men, horses = col(s).horses, morale = col(s).morale, condition = col(s).condition;
    expect(chooseEvent(s, 0)).toBe(true);
    expect(col(s).men).toBe(men + R.DESERTERS_MEN);
    expect(col(s).horses).toBe(horses + R.DESERTERS_HORSES);
    expect(col(s).morale).toBe(morale - R.DESERTERS_MORALE);
    // their thin horses water down the condition of the whole herd
    expect(col(s).condition).toBeCloseTo((condition * horses + R.DESERTERS_CONDITION * R.DESERTERS_HORSES) / (horses + R.DESERTERS_HORSES));
  });

  it("can be sent away with nothing gained", () => {
    const s = won();
    chooseEvent(s, 1);
    step(s);
    const men = col(s).men, horses = col(s).horses;
    expect(chooseEvent(s, 1)).toBe(true);
    expect(col(s).men).toBe(men);
    expect(col(s).horses).toBe(horses);
  });
});

describe("ice", () => {
  /** A fed column at Taiyuan, its route on down the Fen valley, in January. */
  function january(id = "taiyuan"): GameState {
    const s = at(id);
    s.hour = 122 * 24; // 1 January 1219
    col(s).route = ["fenzhou", "huozhou"];
    return s;
  }

  it("is offered in January where the Fen is frozen", () => {
    const s = january();
    step(s);
    expect(dateOf(s).month).toBe(0);
    expect(s.event).toMatchObject({ id: "ice", column: 0, site: "taiyuan" });
    expect(eventView(s)!.text).toContain("frozen");
  });

  it("crossing on the ice moves the column about 60 km along the route", () => {
    const s = january();
    step(s);
    s.rng = seedWhere(v => v >= R.ICE_RISK);
    expect(chooseEvent(s, 0)).toBe(true);
    expect(col(s).at).toBeNull();
    expect(col(s).leg).toMatchObject({ from: "taiyuan", to: "fenzhou" });
    expect(col(s).leg!.done).toBeCloseTo(R.ICE_KM, 0);
  });

  it("the ice can break under part of the herd", () => {
    const s = january();
    step(s);
    s.rng = seedWhere(v => v < R.ICE_RISK);
    const horses = col(s).horses;
    expect(chooseEvent(s, 0)).toBe(true);
    expect(col(s).horses).toBe(horses - Math.round(horses * R.ICE_LOSS));
  });

  it("is not offered in October", () => {
    const s = at("taiyuan");
    s.hour = 30 * 24; // 1 October 1218
    col(s).route = ["fenzhou", "huozhou"];
    step(s);
    expect(dateOf(s).month).toBe(9);
    expect(s.event).toBeNull();
  });
});

describe("jumpAhead", () => {
  it("stops before a site held by a Jin army, like marching does", () => {
    const s = newGame();
    Object.assign(col(s), { at: "hunyuan", rations: 1e9 });
    col(s).route = ["lingqiu", "laiyuan", "zijing"];
    Object.assign(s.jin[0], { kind: "field", at: "laiyuan", leg: null, route: [], foot: 5000, horse: 0 });
    const covered = jumpAhead(s, col(s), 1000);
    expect(covered).toBeGreaterThan(0);
    expect(col(s).at).toBe("lingqiu");
    expect(col(s).leg).toBeNull();
    expect(col(s).route).toEqual(["laiyuan", "zijing"]);
  });

  it("moves the column without tiring it or counting marching hours", () => {
    const s = newGame();
    Object.assign(col(s), { at: "taiyuan", rations: 1e9 });
    col(s).route = ["fenzhou"];
    const fatigue = col(s).fatigue;
    expect(jumpAhead(s, col(s), R.ICE_KM)).toBeCloseTo(R.ICE_KM, 0);
    expect(col(s).fatigue).toBe(fatigue);
    expect(col(s).today).toEqual({ marchHours: 0, km: 0 });
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
