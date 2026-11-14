import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO, SCENARIOS, findScenario, type Scenario } from "../../src/data/scenarios";

const inside = (s: Scenario, p: { lat: number; lon: number }, margin = 0.05): boolean =>
  p.lat >= s.area.south - margin && p.lat <= s.area.north + margin && p.lon >= s.area.west - margin && p.lon <= s.area.east + margin;

describe("scenario catalogue", () => {
  it("contains the requested places with unique ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["alesund", "geiranger", "oslo", "trondheim", "bergen", "lofoten"]));
    expect(ids).toContain(DEFAULT_SCENARIO);
  });

  it("falls back to the default for unknown ids", () => {
    expect(findScenario("atlantis").id).toBe(DEFAULT_SCENARIO);
    expect(findScenario(null).id).toBe(DEFAULT_SCENARIO);
    expect(findScenario("oslo").name).toBe("Oslo");
  });

  it("marks only Åkneset/Geiranger as a real hazard, as a radial slide wave", () => {
    const real = SCENARIOS.filter((s) => s.realHazard).map((s) => s.id);
    expect(real).toEqual(["geiranger"]);
    expect(findScenario("geiranger").wave.kind).toBe("radial");
  });

  for (const s of SCENARIOS) {
    describe(s.name, () => {
      it("has a sane area and resolution", () => {
        expect(s.area.north).toBeGreaterThan(s.area.south);
        expect(s.area.east).toBeGreaterThan(s.area.west);
        // Mainland Norway.
        expect(s.area.south).toBeGreaterThan(57.5);
        expect(s.area.north).toBeLessThan(71.5);
        expect(s.cellSize).toBeGreaterThanOrEqual(20);
        expect(s.exaggeration).toBeGreaterThanOrEqual(1);
        expect(s.exaggeration).toBeLessThanOrEqual(2.5);
      });

      it("keeps the city, labels, settlements, camera and checks inside the area", () => {
        expect(inside(s, s.city, 0)).toBe(true);
        for (const p of [...s.labels.map((l) => l.at), ...s.settlements.map((x) => x.at), ...s.groundTruth.map((g) => g.at)]) {
          expect(inside(s, p, 0)).toBe(true);
        }
        for (const k of s.camera) {
          expect(inside(s, k.at)).toBe(true);
          expect(inside(s, k.look)).toBe(true);
        }
      });

      it("has a camera path with increasing times that covers the wave", () => {
        for (let i = 1; i < s.camera.length; i++) expect(s.camera[i]!.t).toBeGreaterThan(s.camera[i - 1]!.t);
        expect(s.camera[0]!.t).toBe(0);
        const end = s.camera.at(-1)!.t;
        expect(end).toBeGreaterThan(s.wave.recedeStart);
        for (const k of s.camera) expect(k.alt).toBeGreaterThan(200);
      });

      it("has a coherent wave timeline", () => {
        const w = s.wave;
        expect(w.arriveAt).toBeGreaterThan(w.startTime);
        expect(w.recedeStart).toBeGreaterThan(w.arriveAt);
        expect(w.amplitude).toBeGreaterThanOrEqual(5);
        expect(w.amplitude).toBeLessThanOrEqual(60);
      });

      it("has at least one ground-truth check and a settlement", () => {
        expect(s.groundTruth.length).toBeGreaterThan(0);
        expect(s.settlements.length).toBeGreaterThan(0);
        for (const g of s.groundTruth) expect(g.max).toBeGreaterThan(g.min);
      });
    });
  }
});
