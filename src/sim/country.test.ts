import { describe, expect, it } from "vitest";
import * as R from "./constants";
import { forageBlock, forageYield, guardedBy, orderForage, population, slaughterFlock } from "./country";
import { effectivePace, newGame, orderMarch, step, type GameState } from "./game";
import { makeSave, readSave } from "./save";
import { SCENARIO } from "./scenario";

const graph = SCENARIO.graph;
const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };
const col = (s: GameState) => s.columns[0];

/** The column fed and standing at a place, Jin armies out of the way. */
function at(id: string): GameState {
  const s = newGame();
  s.jin = [];
  Object.assign(col(s), { at: id, rations: 10000 });
  return s;
}

describe("the countryside", () => {
  it("has villages in Jin and contested land, none in Mongol land or in the passes", () => {
    expect(population(graph.site("taiyuan"))).toBe(3); // a city on the plain
    expect(population(graph.site("daizhou"))).toBe(2); // a city in the uplands
    expect(population(graph.site("huozhou"))).toBe(2); // a crossroads on the plain
    expect(population(graph.site("wutai"))).toBe(1); // in the mountains
    expect(population(graph.site("datong"))).toBe(0); // Mongol land
    expect(population(graph.site("shiling"))).toBe(0); // a pass
    const s = newGame();
    expect(s.sites.taiyuan.food).toBe(3 * R.COUNTRY_FOOD);
    expect(s.sites.taiyuan.hostility).toBe(30);
    expect(s.sites.datong.food).toBe(0);
  });

  it("winter eats into the villages' stores", () => {
    const s = at("datong");
    s.hour = 70 * 24; // mid-November
    const before = s.sites.huozhou.food;
    days(s, 30);
    expect(s.sites.huozhou.food).toBeCloseTo(before * (1 - R.WINTER_LOSS / 30) ** 30, 0);
  });
});

describe("requisition", () => {
  it("takes a day and brings in a quarter of the food and grain, angering the villagers a little", () => {
    const s = at("huozhou");
    const food = s.sites.huozhou.food, rations = col(s).rations;
    const y = forageYield(s, "huozhou", "requisition");
    expect(y.food).toBe(food * R.REQUISITION_SHARE);
    expect(orderForage(s, 0, "requisition")).toBe(true);
    days(s, 0.5);
    expect(col(s).foraging).not.toBeNull();
    days(s, 0.6);
    expect(col(s).foraging).toBeNull();
    expect(s.sites.huozhou.food).toBe(food - y.food);
    expect(col(s).rations).toBeGreaterThan(rations + y.food - 3000 * 2); // two days of eating at most
    expect(col(s).grain).toBeGreaterThan(0);
    expect(s.sites.huozhou.hostility).toBeGreaterThanOrEqual(30 + R.REQUISITION_HOSTILITY - R.HOSTILITY_COOLING);
    expect(s.sites.huozhou.hostility).toBeLessThanOrEqual(30 + R.REQUISITION_HOSTILITY);
    expect(s.log.some(l => l.text.includes("brings in") && l.kind === "arrival")).toBe(true);
  });

  it("brings half as much where the villagers already hate the Mongols", () => {
    const s = at("huozhou");
    s.sites.huozhou.hostility = 60;
    expect(forageYield(s, "huozhou", "requisition").food).toBe(s.sites.huozhou.food * R.REQUISITION_SHARE / 2);
  });

  it("is allowed next to a Jin city, but plunder is not", () => {
    const s = at("yuanping");
    expect(guardedBy(s, "yuanping")).toBe("yuanping");
    expect(forageBlock(s, col(s), "requisition")).toBeNull();
    expect(forageBlock(s, col(s), "plunder")).toContain("too close");
    s.cities.yuanping.taken = true;
    s.cities.xinzhou.taken = true;
    s.cities.daizhou.taken = true;
    expect(forageBlock(s, col(s), "plunder")).toBeNull();
  });

  it("is called off by marching away: nothing is taken", () => {
    const s = at("huozhou");
    const food = s.sites.huozhou.food;
    orderForage(s, 0, "requisition");
    orderMarch(s, 0, "fenzhou");
    expect(col(s).foraging).toBeNull();
    days(s, 2);
    expect(s.sites.huozhou.food).toBeCloseTo(food, 6);
  });
});

describe("plunder", () => {
  it("takes two days and most of everything, livestock too, burns the fields and angers the places around", () => {
    const s = at("yizhou"); // a contested city on the Hebei plain, with no Jin garrison near
    const st = s.sites.yizhou;
    expect(forageBlock(s, col(s), "plunder")).toBeNull();
    const y = forageYield(s, "yizhou", "plunder");
    const nearby = graph.neighbours("yizhou").map(n => n.to).find(id => population(graph.site(id)) > 0)!;
    const before = s.sites[nearby].hostility;
    orderForage(s, 0, "plunder");
    days(s, 2.1);
    expect(col(s).sheep).toBe(y.livestock);
    expect(effectivePace(col(s))).toBe("grazing"); // the livestock walks at the flock's pace
    expect(st.burned).toBe(true);
    expect(st.food).toBe(0);
    expect(st.hostility).toBeGreaterThan(15 + R.PLUNDER_HOSTILITY - 3);
    expect(s.sites[nearby].hostility).toBeGreaterThan(before);
    expect(forageBlock(s, col(s), "requisition")).toContain("burned");
    expect(s.log.some(l => l.text.includes("burns the fields") && l.kind === "arrival")).toBe(true);
  });
});

describe("hostile villagers", () => {
  it("steal horses at night", () => {
    const s = at("huozhou");
    s.sites.huozhou.hostility = 90;
    const horses = col(s).horses;
    days(s, 1);
    expect(col(s).horses).toBe(horses - Math.round(horses * R.HORSE_THEFT));
    expect(s.log.some(l => l.text.includes("steal"))).toBe(true);
  });

  it("cool down a point a day, but not below where they started", () => {
    const s = at("datong");
    s.sites.huozhou.hostility = 40;
    days(s, 5);
    expect(s.sites.huozhou.hostility).toBe(35);
    days(s, 10);
    expect(s.sites.huozhou.hostility).toBe(30);
  });
});

describe("slaughtering the flock", () => {
  it("gives half the meat at once, and the column is free to move fast", () => {
    const s = at("datong");
    col(s).sheep = 1000;
    const rations = col(s).rations;
    expect(slaughterFlock(s, 0)).toBe(true);
    expect(col(s).sheep).toBe(0);
    expect(col(s).rations).toBe(rations + 1000 * R.RATIONS_PER_SHEEP * R.SLAUGHTER_SHARE);
  });
});

describe("saves", () => {
  it("keep the countryside and the foragers", () => {
    const s = newGame();
    Object.assign(col(s), { at: "yizhou", rations: 10000 });
    orderForage(s, 0, "plunder");
    days(s, 1);
    const loaded = readSave(JSON.stringify(makeSave(s, 0))).game;
    expect(loaded).toEqual(s);
  });
});
