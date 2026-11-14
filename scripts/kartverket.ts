/**
 * Pure helpers for talking to Kartverket's public APIs.
 *
 * - Elevation: Kartverket "Nasjonal høydemodell" DTM via Geonorge WCS
 *   (https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833), CC BY 4.0.
 * - Water level: Kartverket "Se havnivå" API
 *   (https://vannstand.kartverket.no/tideapi_en.html), CC BY 4.0.
 */

export const WCS_ENDPOINT = "https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833";
export const TIDE_ENDPOINT = "https://vannstand.kartverket.no/tideapi.php";

/** Extract coverage names from a WCS 1.0.0 GetCapabilities document. */
export function parseCoverageNames(xml: string): string[] {
  const names: string[] = [];
  const briefRe = /<(?:\w+:)?CoverageOfferingBrief\b[\s\S]*?<\/(?:\w+:)?CoverageOfferingBrief>/g;
  for (const brief of xml.match(briefRe) ?? []) {
    const m = /<(?:\w+:)?name>\s*([^<\s]+)\s*<\/(?:\w+:)?name>/.exec(brief);
    if (m?.[1] !== undefined) names.push(m[1]);
  }
  return names;
}

/** Choose the DTM coverage (terrain model, not surface model). */
export function pickDtmCoverage(names: readonly string[]): string | undefined {
  return (
    names.find((n) => /dtm/i.test(n) && /25833/.test(n) && !/dom|skygge|shade/i.test(n)) ??
    names.find((n) => /dtm/i.test(n) && !/dom|skygge|shade/i.test(n))
  );
}

export function coverageUrl(
  coverage: string,
  bbox: readonly [number, number, number, number],
  width: number,
  height: number,
  format: string,
): string {
  const params = new URLSearchParams({
    service: "WCS",
    version: "1.0.0",
    request: "GetCoverage",
    coverage,
    crs: "EPSG:25833",
    response_crs: "EPSG:25833",
    bbox: bbox.join(","),
    width: String(width),
    height: String(height),
    format,
  });
  return `${WCS_ENDPOINT}?${params.toString()}`;
}

/**
 * Whether a DTM cell value represents sea rather than land. Kartverket's DTM
 * sets water surfaces to 0 m (NN2000) and may also use a no-data value.
 */
export function isSeaValue(v: number, noData: number | null): boolean {
  return !Number.isFinite(v) || v === noData || v <= 0 || v > 3000;
}

export function isTiff(buf: Uint8Array): boolean {
  if (buf.length < 4) return false;
  const le = buf[0] === 0x49 && buf[1] === 0x49 && (buf[2] === 42 || buf[2] === 43) && buf[3] === 0;
  const be = buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0 && (buf[3] === 42 || buf[3] === 43);
  return le || be;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 16);
}

export function tideUrl(lat: number, lon: number, from: Date, to: Date, intervalMinutes: number): string {
  const params = new URLSearchParams({
    tide_request: "locationdata",
    lat: String(lat),
    lon: String(lon),
    fromtime: fmt(from),
    totime: fmt(to),
    datatype: "PRE",
    refcode: "NN2000",
    place: "",
    file: "",
    lang: "en",
    interval: String(intervalMinutes),
    dst: "0",
    tzone: "0",
  });
  return `${TIDE_ENDPOINT}?${params.toString()}`;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m?.[1];
}

export interface WaterLevel {
  readonly time: number;
  readonly cm: number;
}

export interface TideResponse {
  readonly levels: WaterLevel[];
  readonly station?: { name: string; code: string; lat: number; lon: number };
  readonly reference?: string;
}

/** Parse a `locationdata` XML response from the tide API. */
export function parseTideResponse(xml: string): TideResponse {
  const err = /<error>([\s\S]*?)<\/error>/i.exec(xml);
  if (err) throw new Error(`Tide API error: ${(err[1] ?? "").trim()}`);
  const levels: WaterLevel[] = [];
  for (const tag of xml.match(/<waterlevel\b[^>]*\/?>/g) ?? []) {
    const value = Number(attr(tag, "value"));
    const time = Date.parse(attr(tag, "time") ?? "");
    if (Number.isFinite(value) && Number.isFinite(time)) levels.push({ time, cm: value });
  }
  const loc = /<location\b[^>]*\/?>/.exec(xml)?.[0];
  const reference = /<reflevelcode>\s*([^<\s]+)\s*<\/reflevelcode>/i.exec(xml)?.[1];
  const result: TideResponse = { levels, ...(reference !== undefined ? { reference } : {}) };
  if (loc !== undefined) {
    return {
      ...result,
      station: {
        name: attr(loc, "name") ?? "",
        code: attr(loc, "code") ?? "",
        lat: Number(attr(loc, "latitude")),
        lon: Number(attr(loc, "longitude")),
      },
    };
  }
  return result;
}

/** Turn time-stamped levels into a regular series. Throws on gaps. */
export function toRegularSeries(levels: readonly WaterLevel[], intervalMinutes: number): { start: number; values: number[] } {
  const sorted = [...new Map(levels.map((l) => [l.time, l])).values()].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  if (first === undefined) throw new Error("no water levels");
  const step = intervalMinutes * 60_000;
  const values: number[] = [];
  for (const [i, l] of sorted.entries()) {
    if (l.time !== first.time + i * step) throw new Error(`gap in tide series at ${new Date(l.time).toISOString()}`);
    values.push(Math.round(l.cm * 10) / 10);
  }
  return { start: first.time, values };
}
