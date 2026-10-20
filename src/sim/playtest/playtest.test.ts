import { describe, expect, it } from "vitest";
import { newGame } from "../game";
import { formatBatch, formatRun, journalLines } from "./digest";
import { POLICIES } from "./policies";
import { checkInvariants, runGame } from "./run";
import { advance, applyCommand, findSite, situation } from "./turn";

describe("the playtest kit", () => {
  it("every policy plays a whole campaign to its end without breaking the state", () => {
    for (const policy of Object.keys(POLICIES)) {
      const r = runGame({ policy, seed: 7 });
      expect(r.final.over).toBe(true);
      expect(r.problems).toEqual([]);
    }
  });

  it("the same seed plays the same campaign", () => {
    const a = runGame({ policy: "careful", seed: 3 }), b = runGame({ policy: "careful", seed: 3 });
    expect(formatRun(a)).toBe(formatRun(b));
  });

  it("a whole campaign fits in a short digest", () => {
    const text = formatRun(runGame({ policy: "careful" }));
    expect(text.split("\n").length).toBeLessThan(150);
    expect(text).toMatch(/^careful seed=\d+ sheep=6000: VICTORY/);
    expect(formatRun(runGame({ policy: "direct" }), { every: 0, log: "none" }).split("\n").length).toBeLessThan(30);
  });

  it("a batch adds the campaigns up by policy", () => {
    const text = formatBatch([runGame({ policy: "idle", seed: 1 }), runGame({ policy: "idle", seed: 2 })]);
    expect(text).toContain("idle: won 0/2");
  });

  it("news repeated with other numbers is printed once, with a count", () => {
    const lines = journalLines([
      { hour: 24, text: "Jin horsemen drive off 625 sheep.", kind: "alert" },
      { hour: 48, text: "Muqali reaches Taiyuan." },
      { hour: 72, text: "Jin horsemen drive off 430 sheep.", kind: "alert" },
    ], "key", 0);
    expect(lines).toEqual(["d1 ! Jin horsemen drive off 625 sheep. [x2, last d3]"]);
  });

  it("the invariants catch a number no rule should produce", () => {
    const s = newGame();
    expect(checkInvariants(s)).toEqual([]);
    s.columns[0].horses = Number.NaN;
    s.columns[0].morale = 140;
    expect(checkInvariants(s)).toEqual(["Muqali.horses is NaN", "Muqali.morale above 100"]);
  });

  it("orders are given in a few words, sites by id or by name", () => {
    const s = newGame();
    expect(findSite("Yanmen")).toBe("yanmen");
    expect(findSite("y")).toBeNull();
    expect(applyCommand(s, "march 0 taiyuan")).toMatch(/^march 0 taiyuan: ok \(\d+ km/);
    expect(applyCommand(s, "pace 0 forced")).toBe("pace 0 forced: ok");
    expect(applyCommand(s, "march 3 taiyuan")).toBe("march 3 taiyuan: no column 3");
    expect(applyCommand(s, "dance")).toMatch(/unknown order/);
  });

  it("the game runs until the player is needed, and says why it stopped", () => {
    // the merchants want sheep: with a flock, they meet the column on its first day
    const s = newGame(6000);
    applyCommand(s, "march 0 taiyuan");
    const a = advance(s, 30 * 24);
    expect(a.reason).toMatch(/^event: merchant/);
    expect(situation(s)).toContain("EVENT A merchant caravan");
    applyCommand(s, "choose 2");
    expect(advance(s, 30 * 24).hours).toBeGreaterThan(0);
  });

  it("time does not run while a Jin army waits for an answer", () => {
    const s = newGame();
    s.threat = { kind: "attack", column: 0, army: 0, site: "datong", hour: s.hour };
    expect(advance(s, 24)).toMatchObject({ hours: 0 });
  });
});
