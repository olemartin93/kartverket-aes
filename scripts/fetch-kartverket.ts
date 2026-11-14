/**
 * Downloads the data every scenario needs from Kartverket and writes it to
 * public/data/<scenario>/. Runs in CI before every deploy (and weekly) so the
 * shipped data is fresh and always comes straight from the authoritative source.
 *
 *   npm run fetch-data              (all scenarios)
 *   npm run fetch-data -- oslo      (one scenario, for development)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fromArrayBuffer } from "geotiff";
import { SCENARIOS, type Scenario } from "../src/data/scenarios";
import type { DataIndex, TerrainMeta, TideData } from "../src/data/types";
import { groundTruthResults, validateTerrain, validateTide } from "../src/data/validate";
import { sceneGeometry, scenarioBbox } from "./geo";
import {
  WCS_ENDPOINT,
  coverageUrl,
  isSeaValue,
  isTiff,
  parseCoverageNames,
  parseTideResponse,
  pickDtmCoverage,
  tideUrl,
  toRegularSeries,
} from "./kartverket";

const OUT = new URL("../public/data/", import.meta.url);
const NODATA = -32768;
const SCALE = 0.1;
const LICENSE = "CC BY 4.0";
const ATTRIBUTION = "© Kartverket";
const HEADERS = { "User-Agent": "aes-tsunami-pwa/1.0 (static site build)" };
/** Keep each download modest so the whole app stays small enough to precache. */
const MAX_CELLS = 400_000;

async function get(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

let coverageName: string | undefined;
async function dtmCoverage(): Promise<string> {
  if (coverageName !== undefined) return coverageName;
  const caps = await (await get(`${WCS_ENDPOINT}?service=WCS&request=GetCapabilities&version=1.0.0`)).text();
  const names = parseCoverageNames(caps);
  const picked = pickDtmCoverage(names);
  if (picked === undefined) throw new Error(`No DTM coverage found. Coverages: ${names.join(", ")}`);
  console.log(`WCS coverage: ${picked} (of ${names.length})`);
  coverageName = picked;
  return picked;
}

async function fetchTerrain(s: Scenario, dir: URL): Promise<void> {
  const coverage = await dtmCoverage();
  const bbox = scenarioBbox(s);
  let width = Math.round((bbox[2] - bbox[0]) / s.cellSize);
  let height = Math.round((bbox[3] - bbox[1]) / s.cellSize);
  if (width * height > MAX_CELLS) {
    const k = Math.sqrt(MAX_CELLS / (width * height));
    width = Math.floor(width * k);
    height = Math.floor(height * k);
  }

  let tiff: ArrayBuffer | undefined;
  let url = "";
  const problems: string[] = [];
  for (const format of ["GeoTIFF", "image/tiff", "GTiff"]) {
    url = coverageUrl(coverage, bbox, width, height, format);
    try {
      const buf = await (await get(url)).arrayBuffer();
      if (isTiff(new Uint8Array(buf))) {
        tiff = buf;
        break;
      }
      problems.push(`${format}: ${new TextDecoder().decode(buf.slice(0, 300))}`);
    } catch (e) {
      problems.push(`${format}: ${String(e)}`);
    }
  }
  if (tiff === undefined) throw new Error(`[${s.id}] GetCoverage failed:\n${problems.join("\n")}`);

  const image = await (await fromArrayBuffer(tiff)).getImage();
  if (image.getWidth() !== width || image.getHeight() !== height) {
    throw new Error(`[${s.id}] unexpected raster size ${image.getWidth()}x${image.getHeight()}, wanted ${width}x${height}`);
  }
  const noData = image.getGDALNoData();
  const [band] = (await image.readRasters({ interleave: false })) as unknown as ArrayLike<number>[];
  if (band === undefined) throw new Error(`[${s.id}] GeoTIFF has no bands`);

  const raw = new Int16Array(width * height);
  let min = Infinity;
  let max = -Infinity;
  let sea = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = Number(band[i]);
    // The DTM stores the sea surface as 0 m (or no-data); treat both as sea.
    if (isSeaValue(v, noData)) {
      raw[i] = NODATA;
      sea++;
      continue;
    }
    raw[i] = Math.max(-32767, Math.min(32767, Math.round(v / SCALE)));
    min = Math.min(min, v);
    max = Math.max(max, v);
  }

  const meta: TerrainMeta = {
    version: 2,
    scenario: s.id,
    synthetic: false,
    source: {
      provider: "Kartverket",
      dataset: `Nasjonal høydemodell – DTM (${coverage})`,
      url,
      license: LICENSE,
      attribution: ATTRIBUTION,
      fetchedAt: new Date().toISOString(),
    },
    crs: "EPSG:25833",
    bbox,
    width,
    height,
    scale: SCALE,
    nodata: NODATA,
    verticalDatum: "NN2000",
    scene: sceneGeometry(s, bbox),
    stats: {
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      seaFraction: Math.round((sea / raw.length) * 1000) / 1000,
    },
  };
  console.log(`[${s.id}] terrain ${width}x${height}, ${meta.stats.min}…${meta.stats.max} m, sea ${meta.stats.seaFraction}`);
  for (const r of groundTruthResults(meta, raw)) console.log(`[${s.id}]   ${r.ok ? "✓" : "✗"} ${r.name}: ${r.value} m`);
  const errors = validateTerrain(meta, raw);
  if (errors.length > 0) throw new Error(`[${s.id}] terrain validation failed:\n- ${errors.join("\n- ")}`);
  await writeFile(new URL("terrain.bin", dir), new Uint8Array(raw.buffer));
  await writeFile(new URL("terrain.json", dir), JSON.stringify(meta));
}

/** Returns false (with a warning) when Kartverket has no prediction for the location. */
async function fetchTide(s: Scenario, dir: URL): Promise<boolean> {
  const interval = 60;
  const day = 86_400_000;
  const start = new Date(Math.floor(Date.now() / day) * day - 2 * day);
  const end = new Date(start.getTime() + 400 * day);
  const { lat, lon } = s.city;
  const levels = [];
  let station;
  let firstUrl = "";
  try {
    for (let t = start.getTime(); t < end.getTime(); t += 30 * day) {
      const to = new Date(Math.min(end.getTime(), t + 30 * day - interval * 60_000));
      const url = tideUrl(lat, lon, new Date(t), to, interval);
      if (firstUrl === "") firstUrl = url;
      const parsed = parseTideResponse(await (await get(url)).text());
      if (parsed.reference !== undefined && parsed.reference.toUpperCase() !== "NN2000") {
        throw new Error(`Tide API returned reference ${parsed.reference}, expected NN2000`);
      }
      if (parsed.levels.length === 0) throw new Error(`no water levels in response for ${url}`);
      levels.push(...parsed.levels);
      station ??= parsed.station;
    }
  } catch (e) {
    console.warn(`[${s.id}] ⚠ no tide prediction: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  const series = toRegularSeries(levels, interval);
  const tide: TideData = {
    version: 1,
    synthetic: false,
    source: {
      provider: "Kartverket",
      dataset: "Se havnivå – tidevannsprognose (astronomical tide prediction)",
      url: firstUrl,
      license: LICENSE,
      attribution: ATTRIBUTION,
      fetchedAt: new Date().toISOString(),
    },
    station: {
      name: station?.name || s.city.name,
      code: station?.code || "",
      lat: Number.isFinite(station?.lat) ? (station?.lat ?? lat) : lat,
      lon: Number.isFinite(station?.lon) ? (station?.lon ?? lon) : lon,
    },
    reference: "NN2000",
    unit: "cm",
    start: new Date(series.start).toISOString(),
    intervalMinutes: interval,
    values: series.values,
  };
  const errors = validateTide(tide);
  if (errors.length > 0) throw new Error(`[${s.id}] tide validation failed:\n- ${errors.join("\n- ")}`);
  await writeFile(new URL("tide.json", dir), JSON.stringify(tide));
  const range = Math.max(...tide.values) - Math.min(...tide.values);
  console.log(`[${s.id}] tide: ${tide.values.length} hourly values, range ${range.toFixed(0)} cm (${tide.station.name} ${tide.station.code})`);
  return true;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const selected = only.length > 0 ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;
const index: DataIndex["scenarios"][number][] = [];
const failures: string[] = [];
for (const s of selected) {
  const dir = new URL(`${s.id}/`, OUT);
  await mkdir(dir, { recursive: true });
  try {
    await fetchTerrain(s, dir);
    index.push({ id: s.id, tide: await fetchTide(s, dir) });
  } catch (e) {
    failures.push(e instanceof Error ? e.message : String(e));
  }
}
if (failures.length > 0) {
  console.error(`\n${failures.length} scenario(s) failed:\n${failures.join("\n\n")}`);
  process.exit(1);
}
const out: DataIndex = { version: 2, synthetic: false, builtAt: new Date().toISOString(), scenarios: index };
await writeFile(new URL("index.json", OUT), JSON.stringify(out, null, 2));
console.log(`\nWrote ${index.length} scenario(s).`);
