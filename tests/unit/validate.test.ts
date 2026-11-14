import { describe, expect, it } from "vitest";
import type { Provenance, TerrainMeta, TideData } from "../../src/data/types";
import { groundTruthResults, isTrustedSource, minHeightNear, validateTerrain, validateTide } from "../../src/data/validate";

const kv = (url: string): Provenance => ({
  provider: "Kartverket",
  dataset: "x",
  url,
  license: "CC BY 4.0",
  attribution: "© Kartverket",
  fetchedAt: "2026-11-14T00:00:00Z",
});

describe("trusted sources", () => {
  it("accepts Kartverket's official HTTPS endpoints only", () => {
    expect(isTrustedSource(kv("https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833?x=1"))).toBe(true);
    expect(isTrustedSource(kv("https://vannstand.kartverket.no/tideapi.php"))).toBe(true);
    expect(isTrustedSource(kv("http://vannstand.kartverket.no/tideapi.php"))).toBe(false);
    expect(isTrustedSource(kv("https://evil.example/wcs.geonorge.no"))).toBe(false);
    expect(isTrustedSource(kv("https://wcs.geonorge.no.evil.example/"))).toBe(false);
    expect(isTrustedSource({ ...kv("https://wcs.geonorge.no/"), provider: "Someone" })).toBe(false);
    expect(isTrustedSource(kv("not a url"))).toBe(false);
  });
});

function terrain(overrides: Partial<TerrainMeta> = {}): { meta: TerrainMeta; raw: Int16Array } {
  const width = 40;
  const height = 40;
  const raw = new Int16Array(width * height).fill(-32768);
  // Land on the east half at 10 m, a 190 m hill ("Aksla") just east of centre, a 500 m peak in a corner.
  for (let j = 0; j < height; j++) for (let i = 20; i < width; i++) raw[j * width + i] = 100;
  raw[20 * width + 21] = 1900;
  raw[39] = 5000;
  const meta: TerrainMeta = {
    version: 2,
    scenario: "test",
    synthetic: false,
    source: kv("https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833"),
    crs: "EPSG:25833",
    bbox: [0, 0, 4000, 4000],
    width,
    height,
    scale: 0.1,
    nodata: -32768,
    verticalDatum: "NN2000",
    scene: {
      city: { x: 0, z: 0 },
      waveOrigin: { x: -1500, z: 0 },
      camera: [
        { t: 0, pos: { x: 0, y: 500, z: 0 }, target: { x: 0, y: 0, z: 0 } },
        { t: 10, pos: { x: 100, y: 500, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      ],
      settlements: [],
      labels: [],
      checks: [{ name: "Aksla", x: 150, z: 50, radius: 300, min: 100, max: 260 }],
    },
    stats: { min: 10, max: 500, seaFraction: 0.5 },
    ...overrides,
  };
  return { meta, raw };
}

describe("terrain validation", () => {
  it("accepts plausible Kartverket data", () => {
    const { meta, raw } = terrain();
    expect(validateTerrain(meta, raw)).toEqual([]);
    expect(groundTruthResults(meta, raw).every((r) => r.ok)).toBe(true);
  });

  it("rejects data from an untrusted host", () => {
    const { meta, raw } = terrain({ source: kv("https://example.com/dem.tif") });
    expect(validateTerrain(meta, raw).join()).toMatch(/untrusted/);
  });

  it("rejects data where a known peak has the wrong height", () => {
    const { meta, raw } = terrain();
    raw[20 * 40 + 21] = 100;
    expect(validateTerrain(meta, raw).join()).toMatch(/Aksla/);
  });

  it("rejects a city centre that is far from sea level (wrong coordinates)", () => {
    const { meta, raw } = terrain();
    const inland = { ...meta, scene: { ...meta.scene, city: { x: 1500, z: 1500 } } };
    for (let j = 25; j < 40; j++) for (let i = 25; i < 40; i++) raw[j * 40 + i] = 3000;
    expect(validateTerrain(inland, raw).join()).toMatch(/city centre/);
  });

  it("treats sea cells as 0 m for the lowest point", () => {
    const { meta, raw } = terrain();
    expect(minHeightNear(meta, raw, -1000, 0, 200)).toBe(0);
  });

  it("rejects a raster of the wrong size", () => {
    const { meta } = terrain();
    expect(validateTerrain(meta, new Int16Array(10)).join()).toMatch(/expected 1600/);
  });

  it("does not run ground-truth checks on synthetic fixtures", () => {
    const { meta, raw } = terrain({ synthetic: true });
    raw[20 * 40 + 21] = 100;
    expect(validateTerrain(meta, raw)).toEqual([]);
  });
});

describe("tide validation", () => {
  const base: TideData = {
    version: 1,
    synthetic: false,
    source: kv("https://vannstand.kartverket.no/tideapi.php?x"),
    station: { name: "ÅLESUND", code: "AES", lat: 62.47, lon: 6.15 },
    reference: "NN2000",
    unit: "cm",
    start: "2026-11-14T00:00:00Z",
    intervalMinutes: 60,
    values: Array.from({ length: 100 }, (_, i) => 80 * Math.sin((2 * Math.PI * i) / 12.42)),
  };

  it("accepts a realistic semi-diurnal tide", () => {
    expect(validateTide(base)).toEqual([]);
  });

  it("accepts Oslo's small tidal range", () => {
    expect(validateTide({ ...base, values: base.values.map((v) => v / 5) })).toEqual([]);
  });

  it("rejects absurd values and untrusted sources", () => {
    expect(validateTide({ ...base, values: [...base.values, 9999] }).join()).toMatch(/out of range/);
    expect(validateTide({ ...base, source: kv("https://example.com") }).join()).toMatch(/untrusted/);
    expect(validateTide({ ...base, values: base.values.map(() => 1) }).join()).toMatch(/tidal range/);
  });
});
