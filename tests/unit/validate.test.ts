import { describe, expect, it } from "vitest";
import type { Provenance, TerrainMeta, TideData } from "../../src/data/types";
import { isTrustedSource, validateTerrain, validateTide } from "../../src/data/validate";

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
  // A 190 m hill ("Aksla") at the centre, land on the east half.
  for (let j = 0; j < height; j++) for (let i = 20; i < width; i++) raw[j * width + i] = 100;
  raw[20 * width + 20] = 1900;
  raw[0] = 5000; // a 500 m peak
  const meta: TerrainMeta = {
    version: 1,
    synthetic: false,
    source: kv("https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833"),
    crs: "EPSG:25833",
    bbox: [0, 0, 4000, 4000],
    width,
    height,
    scale: 0.1,
    nodata: -32768,
    verticalDatum: "NN2000",
    places: { alesund: { lat: 0, lon: 0, x: 0, z: 0 }, aksla: { lat: 0, lon: 0, x: 50, z: 50 } },
    stats: { min: 10, max: 500, seaFraction: 0.5 },
    ...overrides,
  };
  return { meta, raw };
}

describe("terrain validation", () => {
  it("accepts plausible Kartverket data", () => {
    const { meta, raw } = terrain();
    expect(validateTerrain(meta, raw)).toEqual([]);
  });

  it("rejects data from an untrusted host", () => {
    const { meta, raw } = terrain({ source: kv("https://example.com/dem.tif") });
    expect(validateTerrain(meta, raw).join()).toMatch(/untrusted/);
  });

  it("rejects data where Aksla is not ≈189 m", () => {
    const { meta, raw } = terrain();
    raw[20 * 40 + 20] = 100;
    expect(validateTerrain(meta, raw).join()).toMatch(/Aksla/);
  });

  it("rejects a raster of the wrong size", () => {
    const { meta } = terrain();
    expect(validateTerrain(meta, new Int16Array(10)).join()).toMatch(/expected 1600/);
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

  it("rejects absurd values and untrusted sources", () => {
    expect(validateTide({ ...base, values: [...base.values, 9999] }).join()).toMatch(/out of range/);
    expect(validateTide({ ...base, source: kv("https://example.com") }).join()).toMatch(/untrusted/);
    expect(validateTide({ ...base, values: base.values.map(() => 1) }).join()).toMatch(/tidal range/);
  });
});
