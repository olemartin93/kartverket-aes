import proj4 from "proj4";
import { EPSG_25833, PLACES, type LatLon } from "../src/data/places";
import type { LocalPlace } from "../src/data/types";

const toUtm = proj4("WGS84", EPSG_25833);

export function project(p: LatLon): [number, number] {
  const [e, n] = toUtm.forward([p.lon, p.lat]);
  if (e === undefined || n === undefined) throw new Error("projection failed");
  return [e, n];
}

export function localPlaces(bbox: readonly [number, number, number, number]): Record<string, LocalPlace> {
  const cx = (bbox[0] + bbox[2]) / 2;
  const cy = (bbox[1] + bbox[3]) / 2;
  const out: Record<string, LocalPlace> = {};
  for (const [key, p] of Object.entries(PLACES)) {
    const [e, n] = project(p);
    out[key] = { lat: p.lat, lon: p.lon, x: Math.round(e - cx), z: Math.round(cy - n) };
  }
  return out;
}
