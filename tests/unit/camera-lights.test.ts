import { describe, expect, it } from "vitest";
import type { SceneGeometry } from "../../src/data/types";
import { cameraAt, cameraKeys, duration, MIN_CLEARANCE } from "../../src/lib/camera";
import type { Heightfield } from "../../src/lib/heightfield";
import { generateLights } from "../../src/lib/lights";
import { mulberry32 } from "../../src/lib/math";

const scene: SceneGeometry = {
  city: { x: 0, z: 0 },
  waveOrigin: { x: -9000, z: -9000 },
  camera: [
    { t: 0, pos: { x: 9000, y: 900, z: 2000 }, target: { x: 0, y: 0, z: 0 } },
    { t: 5, pos: { x: 6000, y: 750, z: 1500 }, target: { x: 0, y: 0, z: 0 } },
    { t: 12, pos: { x: 3000, y: 600, z: 1000 }, target: { x: -3000, y: 0, z: -3000 } },
    { t: 38, pos: { x: 1200, y: 800, z: 2000 }, target: { x: 0, y: 0, z: 0 } },
  ],
  settlements: [{ x: 0, z: 0, radius: 2600, count: 600 }],
  labels: [],
  checks: [],
};

describe("camera path", () => {
  const keys = cameraKeys(scene);

  it("lasts until the final key", () => {
    expect(duration(keys)).toBe(38);
    expect(cameraAt(keys, 0, () => 0).pos.x).toBeCloseTo(9000);
    expect(cameraAt(keys, 100, () => 0).pos.x).toBeCloseTo(1200);
  });

  it("rejects keys out of order", () => {
    const bad = { ...scene, camera: [scene.camera[1]!, scene.camera[0]!] };
    expect(() => cameraKeys(bad)).toThrow(/increase/);
  });

  it("never dips below the terrain clearance", () => {
    for (let t = 0; t <= 38; t += 0.25) {
      expect(cameraAt(keys, t, () => 1200).pos.y).toBeGreaterThanOrEqual(1200 + MIN_CLEARANCE);
    }
  });

  it("moves smoothly (no jumps between frames)", () => {
    let prev = cameraAt(keys, 0, () => 0).pos;
    for (let t = 1 / 60; t <= 38; t += 1 / 60) {
      const cur = cameraAt(keys, t, () => 0).pos;
      expect(Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z)).toBeLessThan(80);
      prev = cur;
    }
  });
});

describe("city lights", () => {
  // 10 km square, land everywhere east of x=0 at 20 m.
  const w = 100;
  const heights = new Float32Array(w * w);
  const land = new Uint8Array(w * w);
  for (let j = 0; j < w; j++)
    for (let i = 0; i < w; i++) {
      const isLand = i >= 50;
      land[j * w + i] = isLand ? 1 : 0;
      heights[j * w + i] = isLand ? 20 : -10;
    }
  const hf: Heightfield = { width: w, height: w, sizeX: 10_000, sizeZ: 10_000, heights, land };

  it("only places lights on low land and is deterministic", () => {
    const a = generateLights(hf, scene.settlements);
    const b = generateLights(hf, scene.settlements);
    expect(a.length).toBeGreaterThan(100);
    expect(a).toEqual(b);
    for (const l of a) {
      expect(l.x).toBeGreaterThanOrEqual(-60);
      expect(l.ground).toBeGreaterThanOrEqual(0.5);
      expect(l.ground).toBeLessThanOrEqual(20);
    }
  });

  it("uses a seeded PRNG in [0, 1)", () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
