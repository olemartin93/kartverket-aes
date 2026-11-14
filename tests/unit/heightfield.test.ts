import { describe, expect, it } from "vitest";
import type { TerrainMeta } from "../../src/data/types";
import { decodeTerrain, distanceToLand, isLandAt, sampleHeight, seabedDepth } from "../../src/lib/heightfield";

function meta(width: number, height: number, overrides: Partial<TerrainMeta> = {}): TerrainMeta {
  return {
    version: 2,
    scenario: "test",
    synthetic: true,
    source: { provider: "t", dataset: "t", url: "https://example.invalid", license: "n/a", attribution: "t", fetchedAt: "2026-01-01T00:00:00Z" },
    crs: "EPSG:25833",
    bbox: [0, 0, width * 100, height * 100],
    width,
    height,
    scale: 0.1,
    nodata: -32768,
    verticalDatum: "NN2000",
    scene: { city: { x: 0, z: 0 }, waveOrigin: { x: -1, z: -1 }, camera: [], settlements: [], labels: [], checks: [] },
    stats: { min: 0, max: 0, seaFraction: 0 },
    ...overrides,
  };
}

describe("heightfield", () => {
  it("decodes decimetres into metres and fills sea with a seabed", () => {
    const raw = new Int16Array([100, 200, -32768, 300]);
    const hf = decodeTerrain(meta(2, 2), raw.buffer);
    expect(hf.heights[0]).toBeCloseTo(10);
    expect(hf.heights[1]).toBeCloseTo(20);
    expect(hf.heights[3]).toBeCloseTo(30);
    expect(hf.land[2]).toBe(0);
    expect(hf.heights[2]).toBeLessThan(0);
  });

  it("rejects a buffer of the wrong size", () => {
    expect(() => decodeTerrain(meta(4, 4), new Int16Array(3).buffer)).toThrow(/expected 16/);
  });

  it("deepens the seabed away from the coast", () => {
    expect(seabedDepth(0)).toBeGreaterThan(seabedDepth(500));
    expect(seabedDepth(1e9)).toBe(-63);
  });

  it("computes distance to land", () => {
    const land = new Uint8Array([1, 0, 0, 0, 0]);
    const d = distanceToLand(land, 5, 1);
    expect(Array.from(d)).toEqual([0, 1, 2, 3, 4]);
  });

  it("samples bilinearly in local coordinates (x east, z south)", () => {
    // 2x2 grid, 200 m wide; row 0 is north.
    const raw = new Int16Array([0, 1000, 0, 1000]);
    const hf = decodeTerrain(meta(2, 2), raw.buffer);
    expect(sampleHeight(hf, -50, 0)).toBeCloseTo(0);
    expect(sampleHeight(hf, 50, 0)).toBeCloseTo(100);
    expect(sampleHeight(hf, 0, 0)).toBeCloseTo(50);
    expect(sampleHeight(hf, 10_000, 0)).toBeCloseTo(100);
  });

  it("knows land from sea", () => {
    const raw = new Int16Array([100, -32768, 100, -32768]);
    const hf = decodeTerrain(meta(2, 2), raw.buffer);
    expect(isLandAt(hf, -50, -50)).toBe(true);
    expect(isLandAt(hf, 50, -50)).toBe(false);
    expect(isLandAt(hf, 5000, 0)).toBe(false);
  });
});
