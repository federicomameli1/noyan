import { describe, expect, it } from "vitest";
import { BBOX, CITIES, REGIONS, ROADS } from "./index";

const inside = (lon: number, lat: number) => lon >= BBOX.lon0 && lon <= BBOX.lon1 && lat >= BBOX.lat0 && lat <= BBOX.lat1;

describe("world data", () => {
  it("regions have sequential ids and pasture between 0 and 100", () => {
    REGIONS.forEach((r, i) => {
      expect(r.id).toBe(i);
      expect(r.pasture).toBeGreaterThanOrEqual(0);
      expect(r.pasture).toBeLessThanOrEqual(100);
    });
  });

  it("regions, cities and roads fall inside the map", () => {
    for (const r of REGIONS) expect(inside(r.lon, r.lat), r.name).toBe(true);
    for (const c of CITIES) expect(inside(c.lon, c.lat), c.name).toBe(true);
    for (const road of ROADS) for (const [lon, lat] of road) expect(inside(lon, lat)).toBe(true);
  });
});
