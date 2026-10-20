import { describe, expect, it } from "vitest";
import { dropFlock, newGame, orderMarch, orderRefuse, orderSiege, planRoute, siegeDays, step, type GameState } from "./game";
import { armyAt, armyMen, isRelieved, jinReserves, sightLevel } from "./jin";
import { daysBetween } from "./calendar";
import { SCENARIO } from "./scenario";

const days = (s: GameState, n: number) => { for (let i = 0; i < n * 24; i++) step(s); };
const col = (s: GameState) => s.columns[0];
const army = (s: GameState) => s.jin[0];
const horse = (s: GameState) => s.jin[1];
const graph = SCENARIO.graph;

/** A game where food never runs out, with the first column standing at a site. */
function at(id: string): GameState {
  const s = newGame();
  col(s).at = id;
  col(s).rations = 1e9;
  return s;
}

/** Puts an army at a site, with nothing to do. */
function place(s: GameState, i: number, id: string) {
  Object.assign(s.jin[i], { at: id, leg: null, route: [], order: "hold", target: null });
}

describe("the relief army", () => {
  it("waits at Pingyang until Taiyuan has been besieged for 15 days, then marches to it", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    days(s, 14);
    expect(army(s).at).toBe("pingyang");
    expect(army(s).order).toBe("hold");
    days(s, 2);
    expect(army(s).order).toBe("relieve");
    expect(army(s).target).toBe("taiyuan");
  });

  it("reaches the besieged city in about two weeks; lifting the siege lets it in with food, and the siege stops", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    while (!s.threat && s.hour < 60 * 24) step(s);
    const day = s.hour / 24;
    expect(s.threat?.kind).toBe("relief");
    expect(army(s).at).toBe("taiyuan");
    expect(day).toBeGreaterThan(20);
    expect(day).toBeLessThan(35);
    expect(s.log.some(l => l.text.includes("Fight them, or lift the siege") && l.kind === "alert")).toBe(true);
    const stores = s.cities.taiyuan.stores;
    expect(orderRefuse(s)).toBe(true);
    expect(col(s).siege).toBeNull();
    expect(s.cities.taiyuan.progress).toBe(0);
    expect(s.cities.taiyuan.stores).toBe(stores + 20);
    expect(isRelieved(s, "taiyuan")).toBe(true);
    orderSiege(s, 0);
    expect(siegeDays(s, col(s), "taiyuan")).toBe(Infinity);
    const progress = s.cities.taiyuan.progress;
    days(s, 5);
    expect(s.cities.taiyuan.progress).toBe(progress);
    expect(s.log.some(l => l.text.includes("siege can make no headway") && l.kind === "alert")).toBe(true);
  });

  it("also sets out when Fenzhou falls", () => {
    const s = at("datong");
    s.cities.fenzhou.taken = true;
    days(s, 1);
    expect(army(s).order).toBe("relieve");
  });

  it("turns on the towns the Mongols hold when the city they came to relieve has fallen", () => {
    const s = at("datong");
    s.cities.fenzhou.taken = true;
    days(s, 3);
    s.cities.taiyuan.taken = true;
    days(s, 1);
    expect(army(s).order).toBe("call");
    expect(army(s).target).toBe("fenzhou");
  });

  it("calls on the city the Mongols have just taken, if it is the nearest", () => {
    const s = at("datong");
    days(s, 3);
    s.cities.taiyuan.taken = true;
    days(s, 1);
    expect(army(s).order).toBe("call");
    expect(army(s).target).toBe("taiyuan");
  });
});

describe("what the scouts see", () => {
  it("sees more of an army the closer it is", () => {
    const s = at("taiyuan");
    place(s, 0, "pingyang"); // about 200 km
    expect(sightLevel(s, army(s))).toBe(0);
    place(s, 0, "huozhou"); // about 145 km
    expect(sightLevel(s, army(s))).toBe(0);
    place(s, 0, "fenzhou"); // about 90 km
    expect(sightLevel(s, army(s))).toBe(1);
    place(s, 0, "yuci"); // about 25 km
    expect(sightLevel(s, army(s))).toBe(3);
  });

  it("scouts on exhausted horses see half as far", () => {
    const s = at("taiyuan");
    place(s, 0, "fenzhou");
    col(s).condition = 10;
    expect(sightLevel(s, army(s))).toBe(0);
  });

  it("reports a first sighting as an alert, then adds detail as the army comes closer", () => {
    const s = at("taiyuan");
    place(s, 0, "fenzhou");
    place(s, 1, "pingyang"); // the horsemen out of sight
    days(s, 1 / 24);
    const first = s.log.filter(l => l.text.startsWith("Scouts"));
    expect(first).toHaveLength(1);
    expect(first[0].kind).toBe("alert");
    expect(first[0].text).toContain("large Jin army");
    expect(first[0].text).not.toContain("8,500");
    place(s, 0, "yuci");
    days(s, 1 / 24);
    expect(s.log.at(-1)!.text).toContain("7,000 foot and 1,500 horse");
  });

  it("remembers where an army was last seen once it is out of sight", () => {
    const s = at("taiyuan");
    place(s, 0, "fenzhou");
    days(s, 1 / 24);
    place(s, 0, "pingyang");
    days(s, 1 / 24);
    expect(army(s).sight).toBe(0);
    expect(army(s).seen?.site).toBe("fenzhou");
  });
});

describe("the Jin horsemen", () => {
  it("drive off a flock left with no one to guard it near a Jin town", () => {
    const s = at("yuanping");
    s.columns[0].sheep = 3000;
    dropFlock(s, 0);
    orderMarch(s, 0, "daizhou");
    days(s, 6);
    expect(s.sites.yuanping.sheep).toBe(0);
    expect(s.log.some(l => l.text.includes("drive off") && l.kind === "alert")).toBe(true);
  });

  it("leave a flock alone while a column stands with it", () => {
    const s = at("yuanping");
    s.columns[0].sheep = 3000;
    dropFlock(s, 0);
    days(s, 6);
    expect(s.sites.yuanping.sheep).toBe(3000);
  });

  it("fall back from a column that comes near", () => {
    const s = at("yuanping");
    days(s, 2);
    expect(horse(s).at).not.toBe("xinzhou");
    expect(horse(s).target).not.toBe("xinzhou");
    days(s, 5);
    expect(horse(s).at).not.toBe("xinzhou");
  });
});

describe("the war effort of the Jin", () => {
  it("sends another army from the south on the day given", () => {
    const s = at("datong");
    expect(s.jin).toHaveLength(SCENARIO.jin.length);
    const first = SCENARIO.jinReserves[0];
    const day = daysBetween(SCENARIO.start, first.date);
    days(s, day - 1);
    expect(s.jin).toHaveLength(SCENARIO.jin.length);
    days(s, 2);
    expect(s.jin).toHaveLength(SCENARIO.jin.length + 1);
    const a = s.jin.at(-1)!;
    expect(a.name).toBe(first.name);
    expect(a.at).toBe(first.home);
    expect(a.foot).toBe(first.foot);
    expect(s.jinArrived).toBe(1);
    expect(s.log.some(l => l.text.includes("The Jin send another army") && l.kind === "alert")).toBe(true);
  });

  it("the new army knows which city it is to relieve, without being looked up by name", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    const first = SCENARIO.jinReserves[0];
    days(s, daysBetween(SCENARIO.start, first.date) + 2);
    const a = s.jin.at(-1)!;
    expect(a.relieve).toEqual(first.relieve);
    // the siege has gone on long enough: the new army sets out for Taiyuan
    days(s, 3);
    expect(a.order).toBe("relieve");
    expect(a.target).toBe("taiyuan");
  });

  it("sends the second army later, and no more after that", () => {
    const s = at("datong");
    const second = SCENARIO.jinReserves[1];
    days(s, daysBetween(SCENARIO.start, second.date) + 2);
    expect(s.jin).toHaveLength(SCENARIO.jin.length + SCENARIO.jinReserves.length);
    expect(s.jinArrived).toBe(SCENARIO.jinReserves.length);
    days(s, 40);
    expect(s.jin).toHaveLength(SCENARIO.jin.length + SCENARIO.jinReserves.length);
  });
});

describe("a Jin army on the road", () => {
  it("bars the road through its place: the column waits in front of it", () => {
    const s = at("daizhou");
    place(s, 0, "yuanping");
    orderMarch(s, 0, "xinzhou");
    days(s, 3);
    expect(col(s).at).toBe("daizhou");
    expect(col(s).waiting).toBe("yuanping");
    expect(s.log.some(l => l.text.includes("bars the road at Yuanping"))).toBe(true);
  });

  it("a column can still march up to it", () => {
    const s = at("daizhou");
    place(s, 0, "yuanping");
    orderMarch(s, 0, "yuanping");
    days(s, 3);
    expect(col(s).at).toBe("yuanping");
    expect(armyAt(s, "yuanping")).toBeDefined();
  });

  it("routes go around armies the scouts can see", () => {
    const s = at("daizhou");
    place(s, 0, "yuanping");
    days(s, 1 / 24);
    const plan = planRoute(s, col(s), "taiyuan")!;
    expect(plan.sites).not.toContain("yuanping");
    expect(graph.site(plan.sites.at(-1)!).id).toBe("taiyuan");
  });
});

describe("a beaten Jin army", () => {
  it("that has lost its nerve goes home and stays there, even while the city it came to relieve is besieged", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    s.cities.taiyuan.besiegedDays = 30;
    army(s).morale = 10;
    days(s, 1);
    expect(army(s).broken).toBe(true);
    expect(army(s).at).toBe("pingyang");
    expect(army(s).order).toBe("hold");
    days(s, 10);
    expect(army(s).order).toBe("hold");
    expect(army(s).morale).toBeGreaterThan(10);
  });

  it("regroups at home: once its morale is back it marches again, with the men it has left", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    s.cities.taiyuan.besiegedDays = 30;
    army(s).morale = 10;
    army(s).foot = 3000;
    days(s, 1);
    expect(army(s).broken).toBe(true);
    days(s, army(s).muster.morale - 10 + 1);
    expect(army(s).broken).toBe(false);
    expect(army(s).foot).toBe(3000);
    expect(army(s).order).toBe("relieve");
    expect(s.log.some(l => l.text.includes("has regrouped at Pingyang"))).toBe(true);
  });

  it("left with a fifth of its men or fewer disbands, and its convoys with it", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    army(s).foot = 1000;
    army(s).horse = 500;
    s.convoys.push({ at: "pingyang", leg: null, cameFrom: null, route: [], army: 0, food: 5 });
    days(s, 1);
    expect(army(s).foot + army(s).horse).toBe(0);
    expect(s.convoys).toHaveLength(0);
    expect(s.log.some(l => l.text.includes("The Pingyang army is no more: its last 1,500 men"))).toBe(true);
  });

  it("disbanding into a walled town adds its men to the garrison", () => {
    const s = at("datong");
    days(s, 0);
    jinReserves(s);
    s.hour = 70 * 24;
    while (s.jin.length < 4) jinReserves(s);
    const host = s.jin[3];
    expect(host.home).toBe("fenzhou");
    const garrison = s.cities.fenzhou.garrison;
    host.foot = 500;
    host.horse = 0;
    days(s, 1);
    expect(armyMen(host)).toBe(0);
    expect(s.cities.fenzhou.garrison).toBe(garrison + 500);
  });
});
