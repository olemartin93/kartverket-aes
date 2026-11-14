import type { TerrainMeta } from "../data/types";

export interface Heightfield {
  readonly width: number;
  readonly height: number;
  /** Scene extent in metres. */
  readonly sizeX: number;
  readonly sizeZ: number;
  /** Elevation in metres (NN2000). Sea cells get a synthetic seabed depth. */
  readonly heights: Float32Array;
  /** 1 where Kartverket provides land elevation, 0 for sea. */
  readonly land: Uint8Array;
}

/** Seabed depth used for sea cells (the DTM contains no bathymetry). */
export function seabedDepth(distanceToLandM: number): number {
  return -(3 + Math.min(distanceToLandM * 0.03, 60));
}

/** Two-pass chamfer distance transform (in cells) from land cells. */
export function distanceToLand(land: Uint8Array, width: number, height: number): Float32Array {
  const d = new Float32Array(width * height);
  const big = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = land[i] === 1 ? 0 : big;
  const at = (i: number): number => d[i] ?? big;
  const diag = Math.SQRT2;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      let v = at(k);
      if (i > 0) v = Math.min(v, at(k - 1) + 1);
      if (j > 0) {
        v = Math.min(v, at(k - width) + 1);
        if (i > 0) v = Math.min(v, at(k - width - 1) + diag);
        if (i < width - 1) v = Math.min(v, at(k - width + 1) + diag);
      }
      d[k] = v;
    }
  }
  for (let j = height - 1; j >= 0; j--) {
    for (let i = width - 1; i >= 0; i--) {
      const k = j * width + i;
      let v = at(k);
      if (i < width - 1) v = Math.min(v, at(k + 1) + 1);
      if (j < height - 1) {
        v = Math.min(v, at(k + width) + 1);
        if (i < width - 1) v = Math.min(v, at(k + width + 1) + diag);
        if (i > 0) v = Math.min(v, at(k + width - 1) + diag);
      }
      d[k] = v;
    }
  }
  return d;
}

export function decodeTerrain(meta: TerrainMeta, buffer: ArrayBuffer): Heightfield {
  const raw = new Int16Array(buffer);
  if (raw.length !== meta.width * meta.height) {
    throw new Error(`terrain.bin has ${raw.length} cells, expected ${meta.width * meta.height}`);
  }
  const sizeX = meta.bbox[2] - meta.bbox[0];
  const sizeZ = meta.bbox[3] - meta.bbox[1];
  const land = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) land[i] = raw[i] === meta.nodata ? 0 : 1;
  const dist = distanceToLand(land, meta.width, meta.height);
  const cell = (sizeX / meta.width + sizeZ / meta.height) / 2;
  const heights = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    heights[i] = land[i] === 1 ? (raw[i] ?? 0) * meta.scale : seabedDepth((dist[i] ?? 0) * cell);
  }
  return { width: meta.width, height: meta.height, sizeX, sizeZ, heights, land };
}

/** Bilinear elevation (m) at local scene coordinates (x east, z south). */
export function sampleHeight(hf: Heightfield, x: number, z: number): number {
  const fx = Math.min(Math.max(((x + hf.sizeX / 2) / hf.sizeX) * hf.width - 0.5, 0), hf.width - 1);
  const fz = Math.min(Math.max(((z + hf.sizeZ / 2) / hf.sizeZ) * hf.height - 0.5, 0), hf.height - 1);
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const i1 = Math.min(i0 + 1, hf.width - 1);
  const j1 = Math.min(j0 + 1, hf.height - 1);
  const tx = fx - i0;
  const tz = fz - j0;
  const h = (i: number, j: number): number => hf.heights[j * hf.width + i] ?? 0;
  const top = h(i0, j0) * (1 - tx) + h(i1, j0) * tx;
  const bottom = h(i0, j1) * (1 - tx) + h(i1, j1) * tx;
  return top * (1 - tz) + bottom * tz;
}

export function isLandAt(hf: Heightfield, x: number, z: number): boolean {
  const i = Math.round(((x + hf.sizeX / 2) / hf.sizeX) * hf.width - 0.5);
  const j = Math.round(((z + hf.sizeZ / 2) / hf.sizeZ) * hf.height - 0.5);
  if (i < 0 || j < 0 || i >= hf.width || j >= hf.height) return false;
  return hf.land[j * hf.width + i] === 1;
}
