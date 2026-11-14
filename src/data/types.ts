export interface Provenance {
  /** Organisation that publishes the data. */
  readonly provider: string;
  readonly dataset: string;
  /** Exact URL the data was downloaded from. */
  readonly url: string;
  readonly license: string;
  readonly attribution: string;
  /** ISO timestamp of the download. */
  readonly fetchedAt: string;
}

/** Local scene coordinates in metres relative to the raster centre (x = east, z = south). */
export interface XZ {
  readonly x: number;
  readonly z: number;
}

export interface XYZ extends XZ {
  readonly y: number;
}

export interface SceneGeometry {
  readonly city: XZ;
  readonly waveOrigin: XZ;
  readonly camera: ReadonlyArray<{ readonly t: number; readonly pos: XYZ; readonly target: XYZ }>;
  readonly settlements: ReadonlyArray<XZ & { readonly radius: number; readonly count: number }>;
  readonly labels: ReadonlyArray<XZ & { readonly text: string; readonly from: number; readonly to: number }>;
  /** Ground-truth elevation checks (local coordinates). */
  readonly checks: ReadonlyArray<XZ & { readonly name: string; readonly radius: number; readonly min: number; readonly max: number }>;
}

export interface TerrainMeta {
  readonly version: 2;
  readonly scenario: string;
  /** True only for generated test fixtures. Never deployed. */
  readonly synthetic: boolean;
  readonly source: Provenance;
  readonly crs: "EPSG:25833";
  /** [minE, minN, maxE, maxN] in EPSG:25833 metres. */
  readonly bbox: readonly [number, number, number, number];
  readonly width: number;
  readonly height: number;
  /** Heights are stored as little-endian Int16 = round(metres / scale). */
  readonly scale: number;
  /** Value marking cells without land elevation (sea). */
  readonly nodata: number;
  readonly verticalDatum: "NN2000";
  readonly scene: SceneGeometry;
  readonly stats: { readonly min: number; readonly max: number; readonly seaFraction: number };
}

export interface TideData {
  readonly version: 1;
  readonly synthetic: boolean;
  readonly source: Provenance;
  readonly station: { readonly name: string; readonly code: string; readonly lat: number; readonly lon: number };
  readonly reference: "NN2000";
  readonly unit: "cm";
  /** ISO timestamp of the first value. */
  readonly start: string;
  readonly intervalMinutes: number;
  readonly values: readonly number[];
}

/** public/data/index.json – which scenarios were built and whether tide data exists. */
export interface DataIndex {
  readonly version: 2;
  readonly synthetic: boolean;
  readonly builtAt: string;
  readonly scenarios: ReadonlyArray<{ readonly id: string; readonly tide: boolean }>;
}
