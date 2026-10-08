import { describe, expect, it } from "vitest";
import { addHours, daysBetween, formatDate } from "./calendar";

const start = { year: 1218, month: 8, day: 1, hour: 0 };

describe("calendar", () => {
  it("adds hours across days, months and years", () => {
    expect(addHours(start, 30)).toEqual({ year: 1218, month: 8, day: 2, hour: 6 });
    expect(addHours(start, 30 * 24)).toEqual({ year: 1218, month: 9, day: 1, hour: 0 });
    expect(addHours(start, 122 * 24)).toEqual({ year: 1219, month: 0, day: 1, hour: 0 });
  });

  it("counts the days of the scenario", () => {
    expect(daysBetween(start, { year: 1219, month: 2, day: 31, hour: 0 })).toBe(211);
    expect(daysBetween(start, addHours(start, 57 * 24))).toBe(57);
  });

  it("formats dates in English", () => {
    expect(formatDate(start)).toBe("1 September 1218");
  });
});
