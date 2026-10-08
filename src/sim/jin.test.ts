import { describe, expect, it } from "vitest";
import { dropFlock, newGame, orderMarch, orderSiege, planRoute, siegeDays, step, type GameState } from "./game";
import { armyAt, isRelieved, sightLevel } from "./jin";
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

  it("reaches the besieged city in about two weeks, brings food and stops the siege", () => {
    const s = at("taiyuan");
    orderSiege(s, 0);
    let day = 0;
    while (!army(s).inCity && day < 60) { days(s, 1); day++; }
    expect(army(s).at).toBe("taiyuan");
    expect(day).toBeGreaterThan(20);
    expect(day).toBeLessThan(35);
    expect(isRelieved(s, "taiyuan")).toBe(true);
    expect(siegeDays(s, col(s), "taiyuan")).toBe(Infinity);
    const progress = s.cities.taiyuan.progress, stores = s.cities.taiyuan.stores;
    days(s, 5);
    expect(s.cities.taiyuan.progress).toBe(progress);
    expect(s.cities.taiyuan.stores).toBe(stores);
    expect(s.log.some(l => l.text.includes("siege can make no headway") && l.kind === "alert")).toBe(true);
  });

  it("also sets out when Fenzhou falls", () => {
    const s = at("datong");
    s.cities.fenzhou.taken = true;
    days(s, 1);
    expect(army(s).order).toBe("relieve");
  });

  it("goes back home if Taiyuan falls before it arrives", () => {
    const s = at("datong");
    s.cities.fenzhou.taken = true;
    days(s, 3);
    s.cities.taiyuan.taken = true;
    days(s, 1);
    expect(army(s).order).toBe("return");
    expect(army(s).target).toBe("pingyang");
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
