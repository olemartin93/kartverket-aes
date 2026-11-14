/**
 * Downloads the data the app needs from Kartverket and writes it to public/data.
 * Runs in CI before every deploy (and weekly) so the shipped data is fresh and
 * always comes straight from the authoritative source.
 *
 *   npm run fetch-data
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fromArrayBuffer } from "geotiff";
import { AREA, PLACES, TARGET_CELL_SIZE_M } from "../src/data/places";
import type { TerrainMeta, TideData } from "../src/data/types";
import { validateTerrain, validateTide } from "../src/data/validate";
import { localPlaces, project } from "./geo";
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

function computeBbox(): [number, number, number, number] {
  const corners = [
    project({ lat: AREA.south, lon: AREA.west }),
    project({ lat: AREA.south, lon: AREA.east }),
    project({ lat: AREA.north, lon: AREA.west }),
    project({ lat: AREA.north, lon: AREA.east }),
  ];
  const c = TARGET_CELL_SIZE_M;
  const minE = Math.floor(Math.min(...corners.map((p) => p[0])) / c) * c;
  const maxE = Math.ceil(Math.max(...corners.map((p) => p[0])) / c) * c;
  const minN = Math.floor(Math.min(...corners.map((p) => p[1])) / c) * c;
  const maxN = Math.ceil(Math.max(...corners.map((p) => p[1])) / c) * c;
  return [minE, minN, maxE, maxN];
}

async function fetchTerrain(): Promise<void> {
  const capsUrl = `${WCS_ENDPOINT}?service=WCS&request=GetCapabilities&version=1.0.0`;
  const caps = await (await get(capsUrl)).text();
  const names = parseCoverageNames(caps);
  const coverage = pickDtmCoverage(names);
  if (coverage === undefined) throw new Error(`No DTM coverage found. Coverages: ${names.join(", ")}`);
  console.log(`WCS coverage: ${coverage} (of ${names.length})`);

  const bbox = computeBbox();
  const width = Math.round((bbox[2] - bbox[0]) / TARGET_CELL_SIZE_M);
  const height = Math.round((bbox[3] - bbox[1]) / TARGET_CELL_SIZE_M);

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
  if (tiff === undefined) throw new Error(`GetCoverage failed:\n${problems.join("\n")}`);

  const image = await (await fromArrayBuffer(tiff)).getImage();
  if (image.getWidth() !== width || image.getHeight() !== height) {
    throw new Error(`Unexpected raster size ${image.getWidth()}x${image.getHeight()}, wanted ${width}x${height}`);
  }
  const noData = image.getGDALNoData();
  const [band] = (await image.readRasters({ interleave: false })) as unknown as ArrayLike<number>[];
  if (band === undefined) throw new Error("GeoTIFF has no bands");

  const raw = new Int16Array(width * height);
  let min = Infinity;
  let max = -Infinity;
  let sea = 0;
  let exactZero = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = Number(band[i]);
    if (v === 0) exactZero++;
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

  console.log(`No-data value: ${String(noData)}; cells exactly 0 m: ${exactZero}; sea cells: ${sea}/${raw.length}`);
  const meta: TerrainMeta = {
    version: 1,
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
    places: localPlaces(bbox),
    stats: { min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10, seaFraction: Math.round((sea / raw.length) * 1000) / 1000 },
  };
  const errors = validateTerrain(meta, raw);
  if (errors.length > 0) throw new Error(`Terrain validation failed:\n- ${errors.join("\n- ")}`);
  await writeFile(new URL("terrain.bin", OUT), new Uint8Array(raw.buffer));
  await writeFile(new URL("terrain.json", OUT), JSON.stringify(meta, null, 2));
  console.log(`Terrain ${width}x${height}, ${meta.stats.min}…${meta.stats.max} m, sea ${meta.stats.seaFraction}`);
}

async function fetchTide(): Promise<void> {
  const interval = 60;
  const day = 86_400_000;
  const start = new Date(Math.floor(Date.now() / day) * day - 2 * day);
  const end = new Date(start.getTime() + 400 * day);
  const { lat, lon } = PLACES.alesund;
  const levels = [];
  let station;
  let firstUrl = "";
  for (let t = start.getTime(); t < end.getTime(); t += 30 * day) {
    const to = new Date(Math.min(end.getTime(), t + 30 * day - interval * 60_000));
    const url = tideUrl(lat, lon, new Date(t), to, interval);
    if (firstUrl === "") firstUrl = url;
    const parsed = parseTideResponse(await (await get(url)).text());
    if (parsed.reference !== undefined && parsed.reference.toUpperCase() !== "NN2000") {
      throw new Error(`Tide API returned reference ${parsed.reference}, expected NN2000`);
    }
    if (parsed.levels.length === 0) throw new Error(`No water levels in response for ${url}`);
    levels.push(...parsed.levels);
    station ??= parsed.station;
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
      name: station?.name || "Ålesund",
      code: station?.code || "AES",
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
  if (errors.length > 0) throw new Error(`Tide validation failed:\n- ${errors.join("\n- ")}`);
  await writeFile(new URL("tide.json", OUT), JSON.stringify(tide));
  console.log(`Tide: ${tide.values.length} hourly values from ${tide.start} (${tide.station.name} ${tide.station.code})`);
}

await mkdir(OUT, { recursive: true });
await fetchTerrain();
await fetchTide();
