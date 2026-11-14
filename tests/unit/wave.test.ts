import { describe, expect, it } from "vitest";
import { arrivalTime, frontDistance, makeWave, RADIAL_R0, waveEta, type WaveTiming } from "../../src/lib/wave";

const origin = { x: -10_000, z: -10_000 };
const target = { x: 0, z: 0 };
const timing: WaveTiming = {
  kind: "plane",
  amplitude: 30,
  width: 650,
  startTime: 5,
  arriveAt: 15,
  inundation: 0.55,
  recedeStart: 40,
  recedeDuration: 5,
};
const wave = makeWave(origin, target, timing);

describe("plane wave", () => {
  it("has a unit direction pointing from origin to target", () => {
    expect(Math.hypot(wave.dir.x, wave.dir.z)).toBeCloseTo(1, 10);
    expect(wave.dir.x).toBeGreaterThan(0);
    expect(wave.dir.z).toBeGreaterThan(0);
  });

  it("reaches the target exactly at arriveAt", () => {
    expect(arrivalTime(target, wave)).toBeCloseTo(15, 10);
    expect(frontDistance(15, wave)).toBeCloseTo(Math.hypot(10_000, 10_000), 3);
  });

  it("rejects arrival before the start", () => {
    expect(() => makeWave(origin, target, { ...timing, arriveAt: 5 })).toThrow();
  });

  it("is flat before the wave starts", () => {
    expect(waveEta(0, 0, 0, wave)).toBe(0);
    expect(waveEta(origin.x, origin.z, 4.99, wave)).toBe(0);
  });

  it("peaks at the crest with the configured amplitude", () => {
    expect(waveEta(target.x, target.z, 15, wave)).toBeCloseTo(30, 0);
  });

  it("draws the sea down just before the crest arrives", () => {
    const t = 15 - (2.2 * wave.width) / wave.speed;
    expect(waveEta(target.x, target.z, t, wave)).toBeLessThan(0);
  });

  it("keeps land flooded behind the crest and recedes later", () => {
    expect(waveEta(target.x, target.z, 20, wave)).toBeGreaterThan(0.4 * 30);
    expect(waveEta(target.x, target.z, 46, wave)).toBeCloseTo(0, 6);
  });

  it("scales linearly with amplitude", () => {
    const big = { ...wave, amplitude: 60 };
    expect(waveEta(1, 2, 16, big)).toBeCloseTo(2 * waveEta(1, 2, 16, wave), 8);
  });
});

describe("radial (rock slide) wave", () => {
  const slide = makeWave({ x: 0, z: 0 }, { x: 20_000, z: 0 }, { ...timing, kind: "radial", startTime: 0, arriveAt: 20 });

  it("spreads equally in every direction", () => {
    const t = 8;
    const r = frontDistance(t, slide);
    const east = waveEta(r, 0, t, slide);
    const north = waveEta(0, -r, t, slide);
    const diag = waveEta(r / Math.SQRT2, r / Math.SQRT2, t, slide);
    expect(east).toBeCloseTo(north, 8);
    expect(east).toBeCloseTo(diag, 8);
  });

  it("loses height with distance beyond the near field", () => {
    const near = waveEta(RADIAL_R0, 0, RADIAL_R0 / slide.speed, slide);
    const far = waveEta(4 * RADIAL_R0, 0, (4 * RADIAL_R0) / slide.speed, slide);
    expect(near).toBeCloseTo(30, 0);
    expect(far).toBeCloseTo(15, 0);
  });

  it("arrives at the target at arriveAt", () => {
    expect(arrivalTime({ x: 20_000, z: 0 }, slide)).toBeCloseTo(20, 10);
  });
});
