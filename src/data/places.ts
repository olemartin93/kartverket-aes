export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/** Hosts we accept as the origin of data shipped in the app. */
export const TRUSTED_DATA_HOSTS = ["wcs.geonorge.no", "vannstand.kartverket.no"] as const;

/** EPSG:25833 – ETRS89 / UTM zone 33N, used nationwide by Kartverket's elevation model. */
export const EPSG_25833 = "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs";
