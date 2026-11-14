import { describe, expect, it } from "vitest";
import { arrivalTime, frontDistance, makeWave, waveEta } from "../../src/lib/wave";

const origin = { x: -10_000, z: -10_000 };
const target = { x: 0, z: 0 };
const wave = makeWave(origin, target, { amplitude: 30, startTime: 5, recedeStart: 40, recedeDuration: 5 });

describe("wave model", () => {
  it("has a unit direction pointing from origin to target", () => {
    expect(Math.hypot(wave.dir.x, wave.dir.z)).toBeCloseTo(1, 10);
    expect(wave.dir.x).toBeGreaterThan(0);
    expect(wave.dir.z).toBeGreaterThan(0);
  });

  it("is flat before the wave starts", () => {
    expect(waveEta(0, 0, 0, wave)).toBe(0);
    expect(waveEta(origin.x, origin.z, 4.99, wave)).toBe(0);
  });

  it("peaks at the crest with the configured amplitude", () => {
    const t = arrivalTime(target, wave);
    expect(waveEta(target.x, target.z, t, wave)).toBeCloseTo(30, 0);
  });

  it("arrives where the front distance equals the distance travelled", () => {
    const t = arrivalTime(target, wave);
    expect(frontDistance(t, wave)).toBeCloseTo(Math.hypot(10_000, 10_000), 3);
  });

  it("draws the sea down just before the crest arrives", () => {
    const t = arrivalTime(target, wave) - (2.2 * wave.width) / wave.speed;
    expect(waveEta(target.x, target.z, t, wave)).toBeLessThan(0);
  });

  it("keeps land flooded behind the crest and recedes later", () => {
    const t = arrivalTime(target, wave) + 5;
    const flooded = waveEta(target.x, target.z, t, wave);
    expect(flooded).toBeGreaterThan(0.4 * 30);
    expect(waveEta(target.x, target.z, 46, wave)).toBeCloseTo(0, 6);
  });

  it("scales linearly with amplitude", () => {
    const big = { ...wave, amplitude: 60 };
    const t = arrivalTime(target, wave) + 1;
    expect(waveEta(1, 2, t, big)).toBeCloseTo(2 * waveEta(1, 2, t, wave), 8);
  });
});
