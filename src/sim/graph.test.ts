import { describe, expect, it } from "vitest";
import geo from "../data/geo.json";
import { distanceKm, findPath } from "./graph";
import { K, PX_PER_DEGREE, BBOX } from "./projection";
import { SCENARIO } from "./scenario";

const g = SCENARIO.graph;

describe("movement graph", () => {
  it("measures distances on the globe", () => {
    // one degree of latitude is about 111 km
    expect(distanceKm(113, 39, 113, 40)).toBeCloseTo(111.2, 0);
  });

  it("links every site to the base", () => {
    for (const s of g.sites) expect(findPath(g, SCENARIO.base, s.id), s.id).not.toBeNull();
  });

  it("has no duplicate sites or links", () => {
    expect(new Set(g.sites.map(s => s.id)).size).toBe(g.sites.length);
    const keys = g.links.map(l => [l.a, l.b].sort().join("-"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts the passes where the map draws them", () => {
    for (const p of geo.passes) {
      const site = g.sites.find(s => s.id === p.id);
      if (!site) continue;
      const x = (site.lon - BBOX.lon0) * PX_PER_DEGREE * K, y = (BBOX.lat1 - site.lat) * PX_PER_DEGREE;
      expect(Math.hypot(x - p.x, y - p.y), p.id).toBeLessThan(2);
    }
  });

  it("finds a route from Datong to Taiyuan across the mountains", () => {
    const path = findPath(g, "datong", "taiyuan")!;
    expect(path[0]).toBe("datong");
    expect(path.at(-1)).toBe("taiyuan");
    expect(path.some(id => g.site(id).kind === "pass")).toBe(true);
  });
});
