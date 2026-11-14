import { describe, expect, it } from "vitest";
import type { LocalPlace } from "../../src/data/types";
import { buildCameraKeys, cameraAt, DURATION, MIN_CLEARANCE } from "../../src/lib/camera";
import type { Heightfield } from "../../src/lib/heightfield";
import { generateLights } from "../../src/lib/lights";
import { mulberry32 } from "../../src/lib/math";

const p = (x: number, z: number): LocalPlace => ({ lat: 0, lon: 0, x, z });
const places = {
  camStart: p(9000, 2000),
  camMid1: p(6000, 1500),
  camMid2: p(3000, 1000),
  camMid3: p(1500, 500),
  camEnd: p(1200, 900),
  alesund: p(0, 0),
  waveOrigin: p(-9000, -9000),
};

describe("camera path", () => {
  const keys = buildCameraKeys(places);

  it("starts at the first key and ends at DURATION", () => {
    expect(keys[0]?.t).toBe(0);
    expect(keys.at(-1)?.t).toBe(DURATION);
    const start = cameraAt(keys, 0, () => 0);
    expect(start.pos.x).toBeCloseTo(9000);
  });

  it("has strictly increasing key times", () => {
    for (let i = 1; i < keys.length; i++) expect(keys[i]!.t).toBeGreaterThan(keys[i - 1]!.t);
  });

  it("never dips below the terrain clearance", () => {
    for (let t = 0; t <= DURATION; t += 0.25) {
      const pose = cameraAt(keys, t, () => 1200);
      expect(pose.pos.y).toBeGreaterThanOrEqual(1200 + MIN_CLEARANCE);
    }
  });

  it("moves smoothly (no jumps between frames)", () => {
    let prev = cameraAt(keys, 0, () => 0).pos;
    for (let t = 1 / 60; t <= DURATION; t += 1 / 60) {
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
    const a = generateLights(hf, { alesund: p(0, 0) });
    const b = generateLights(hf, { alesund: p(0, 0) });
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
