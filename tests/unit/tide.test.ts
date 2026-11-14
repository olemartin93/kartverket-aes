import { describe, expect, it } from "vitest";
import type { TideData } from "../../src/data/types";
import { nextExtremes, tideAt } from "../../src/lib/tide";

const tide: TideData = {
  version: 1,
  synthetic: true,
  source: { provider: "t", dataset: "t", url: "https://example.invalid", license: "n/a", attribution: "t", fetchedAt: "2026-01-01T00:00:00Z" },
  station: { name: "T", code: "T", lat: 0, lon: 0 },
  reference: "NN2000",
  unit: "cm",
  start: "2026-11-14T00:00:00.000Z",
  intervalMinutes: 60,
  values: [0, 50, 100, 50, 0, -50, -100, -50, 0],
};

describe("tide", () => {
  it("interpolates between hourly values and converts cm to m", () => {
    expect(tideAt(tide, new Date("2026-11-14T01:30:00Z"))).toEqual({ metres: 0.75, inRange: true });
  });

  it("flags readings outside the forecast window", () => {
    const r = tideAt(tide, new Date("2027-01-01T00:00:00Z"));
    expect(r.inRange).toBe(false);
    expect(r.metres).toBe(0);
  });

  it("finds the next high and low water", () => {
    const e = nextExtremes(tide, new Date("2026-11-14T00:30:00Z"));
    expect(e.high?.toISOString()).toBe("2026-11-14T02:00:00.000Z");
    expect(e.low?.toISOString()).toBe("2026-11-14T06:00:00.000Z");
  });
});
