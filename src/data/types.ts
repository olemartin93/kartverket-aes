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

export interface LocalPlace {
  readonly lat: number;
  readonly lon: number;
  /** Local scene coordinates in metres (x = east, z = south). */
  readonly x: number;
  readonly z: number;
}

export interface TerrainMeta {
  readonly version: 1;
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
  readonly places: Readonly<Record<string, LocalPlace>>;
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
