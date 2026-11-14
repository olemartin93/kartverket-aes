import { TRUSTED_DATA_HOSTS } from "./places";
import type { Provenance, TerrainMeta, TideData } from "./types";

export function isTrustedSource(source: Provenance): boolean {
  let host: string;
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:") return false;
    host = url.hostname;
  } catch {
    return false;
  }
  return (TRUSTED_DATA_HOSTS as readonly string[]).includes(host) && /kartverket/i.test(source.provider);
}

/** Highest land elevation (m) within `radius` metres of a local point. */
export function maxHeightNear(meta: TerrainMeta, raw: Int16Array, x: number, z: number, radius: number): number {
  const [minE, minN, maxE, maxN] = meta.bbox;
  const dx = (maxE - minE) / meta.width;
  const dz = (maxN - minN) / meta.height;
  const ci = (x + (maxE - minE) / 2) / dx - 0.5;
  const cj = (z + (maxN - minN) / 2) / dz - 0.5;
  const ri = Math.ceil(radius / dx);
  const rj = Math.ceil(radius / dz);
  let best = Number.NEGATIVE_INFINITY;
  for (let j = Math.max(0, Math.floor(cj - rj)); j <= Math.min(meta.height - 1, Math.ceil(cj + rj)); j++) {
    for (let i = Math.max(0, Math.floor(ci - ri)); i <= Math.min(meta.width - 1, Math.ceil(ci + ri)); i++) {
      if (Math.hypot((i - ci) * dx, (j - cj) * dz) > radius) continue;
      const v = raw[j * meta.width + i];
      if (v === undefined || v === meta.nodata) continue;
      best = Math.max(best, v * meta.scale);
    }
  }
  return best;
}

/** Returns a list of problems. An empty list means the terrain data looks sound. */
export function validateTerrain(meta: TerrainMeta, raw: Int16Array): string[] {
  const errors: string[] = [];
  if (meta.version !== 1) errors.push(`unsupported terrain version ${String(meta.version)}`);
  if (!Number.isInteger(meta.width) || !Number.isInteger(meta.height) || meta.width < 16 || meta.height < 16) {
    errors.push(`invalid raster size ${meta.width}x${meta.height}`);
  }
  if (raw.length !== meta.width * meta.height) {
    errors.push(`raster has ${raw.length} cells, expected ${meta.width * meta.height}`);
  }
  if (meta.crs !== "EPSG:25833") errors.push(`unexpected CRS ${meta.crs}`);
  const [minE, minN, maxE, maxN] = meta.bbox;
  if (!(maxE > minE && maxN > minN)) errors.push("invalid bbox");
  if (meta.places["alesund"] === undefined) errors.push("missing place: alesund");
  if (errors.length > 0) return errors;

  if (!meta.synthetic) {
    if (!isTrustedSource(meta.source)) errors.push(`untrusted terrain source: ${meta.source.url}`);
    if (meta.source.license !== "CC BY 4.0") errors.push(`unexpected license ${meta.source.license}`);
    if (meta.stats.max < 300 || meta.stats.max > 2000) errors.push(`implausible max elevation ${meta.stats.max} m`);
    if (meta.stats.min < -50) errors.push(`implausible min elevation ${meta.stats.min} m`);
    if (meta.stats.seaFraction < 0.1 || meta.stats.seaFraction > 0.9) {
      errors.push(`implausible sea fraction ${meta.stats.seaFraction}`);
    }
    // Ground truth: Aksla in Ålesund rises to ≈ 189 m above sea level.
    const aksla = meta.places["aksla"];
    if (aksla === undefined) {
      errors.push("missing place: aksla");
    } else {
      const h = maxHeightNear(meta, raw, aksla.x, aksla.z, 500);
      if (!(h > 100 && h < 260)) errors.push(`Aksla elevation check failed: ${h} m (expected ≈189 m)`);
    }
  }
  return errors;
}

export function validateTide(tide: TideData): string[] {
  const errors: string[] = [];
  if (tide.version !== 1) errors.push(`unsupported tide version ${String(tide.version)}`);
  if (tide.reference !== "NN2000") errors.push(`unexpected reference ${tide.reference}`);
  if (!(tide.intervalMinutes > 0)) errors.push("invalid interval");
  if (Number.isNaN(Date.parse(tide.start))) errors.push("invalid start time");
  if (tide.values.length < 48) errors.push(`too few tide values (${tide.values.length})`);
  if (tide.values.some((v) => !Number.isFinite(v) || Math.abs(v) > 400)) errors.push("tide value out of range");
  if (!tide.synthetic) {
    if (!isTrustedSource(tide.source)) errors.push(`untrusted tide source: ${tide.source.url}`);
    const max = Math.max(...tide.values);
    const min = Math.min(...tide.values);
    // Ålesund has a semi-diurnal tide with a range of roughly 1–2.5 m.
    if (max - min < 80 || max - min > 400) errors.push(`implausible tidal range ${max - min} cm`);
  }
  return errors;
}
