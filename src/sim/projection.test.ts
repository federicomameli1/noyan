import { describe, expect, it } from "vitest";
import { BBOX, HEIGHT, WIDTH, project } from "./projection";

describe("projection", () => {
  it("maps the corners of the map to the corners of the image", () => {
    expect(project(BBOX.lon0, BBOX.lat1)).toEqual([0, 0]);
    const [x, y] = project(BBOX.lon1, BBOX.lat0);
    expect(Math.round(x)).toBe(WIDTH);
    expect(y).toBe(HEIGHT);
  });

  it("matches the size of the drawn map", () => {
    expect([WIDTH, HEIGHT]).toEqual([1065, 780]);
  });
});
