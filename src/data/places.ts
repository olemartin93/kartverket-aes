/**
 * Geographic definitions shared by the data pipeline and the app.
 * Coordinates are WGS84 (lat/lon). They are projected to EPSG:25833
 * (the CRS of Kartverket's national elevation model) by the data scripts.
 */

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/** Area that is downloaded from Kartverket's DTM: Ålesund and surroundings. */
export const AREA = {
  south: 62.33,
  north: 62.58,
  west: 5.9,
  east: 6.6,
} as const;

/** Approximate target ground resolution of the downloaded raster in metres. */
export const TARGET_CELL_SIZE_M = 60;

export const PLACES = {
  /** Ålesund city centre (Brosundet). */
  alesund: { lat: 62.4723, lon: 6.1549 },
  /** Aksla / Fjellstua viewpoint (≈ 189 m). Used to sanity check the elevation data. */
  aksla: { lat: 62.4733, lon: 6.1622 },
  spjelkavik: { lat: 62.4610, lon: 6.3830 },
  langevag: { lat: 62.4430, lon: 6.2050 },
  valderoy: { lat: 62.4930, lon: 6.1200 },
  vigra: { lat: 62.5550, lon: 6.0900 },
  hareid: { lat: 62.3700, lon: 6.0300 },
  /** Camera route: from the east over the fjord westwards towards Ålesund. */
  camStart: { lat: 62.4300, lon: 6.5600 },
  camMid1: { lat: 62.4520, lon: 6.4300 },
  camMid2: { lat: 62.4560, lon: 6.3000 },
  camMid3: { lat: 62.4640, lon: 6.2200 },
  camEnd: { lat: 62.4560, lon: 6.1900 },
  /** Open sea north-west of Ålesund, where the wave originates. */
  waveOrigin: { lat: 62.5800, lon: 5.9000 },
} as const satisfies Record<string, LatLon>;

export type PlaceKey = keyof typeof PLACES;

/** Hosts we accept as the origin of data shipped in the app. */
export const TRUSTED_DATA_HOSTS = ["wcs.geonorge.no", "vannstand.kartverket.no"] as const;

/** EPSG:25833 – ETRS89 / UTM zone 33N. */
export const EPSG_25833 = "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs";
