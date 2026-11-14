import proj4 from "proj4";
import { EPSG_25833, type LatLon } from "../src/data/places";
import type { Scenario } from "../src/data/scenarios";
import type { SceneGeometry, XZ } from "../src/data/types";

const toUtm = proj4("WGS84", EPSG_25833);

export function project(p: LatLon): [number, number] {
  const [e, n] = toUtm.forward([p.lon, p.lat]);
  if (e === undefined || n === undefined) throw new Error("projection failed");
  return [e, n];
}

/** Envelope of the scenario area in EPSG:25833, snapped to the cell size. */
export function scenarioBbox(s: Scenario): [number, number, number, number] {
  const { south, north, west, east } = s.area;
  const corners = [
    project({ lat: south, lon: west }),
    project({ lat: south, lon: east }),
    project({ lat: north, lon: west }),
    project({ lat: north, lon: east }),
  ];
  const c = s.cellSize;
  return [
    Math.floor(Math.min(...corners.map((p) => p[0])) / c) * c,
    Math.floor(Math.min(...corners.map((p) => p[1])) / c) * c,
    Math.ceil(Math.max(...corners.map((p) => p[0])) / c) * c,
    Math.ceil(Math.max(...corners.map((p) => p[1])) / c) * c,
  ];
}

export function toLocal(bbox: readonly [number, number, number, number]): (p: LatLon) => XZ {
  const cx = (bbox[0] + bbox[2]) / 2;
  const cy = (bbox[1] + bbox[3]) / 2;
  return (p) => {
    const [e, n] = project(p);
    return { x: Math.round(e - cx), z: Math.round(cy - n) };
  };
}

/** Projects all of a scenario's geographic definitions into local scene coordinates. */
export function sceneGeometry(s: Scenario, bbox: readonly [number, number, number, number]): SceneGeometry {
  const local = toLocal(bbox);
  return {
    city: local(s.city),
    waveOrigin: local(s.wave.origin),
    camera: s.camera.map((k) => ({ t: k.t, pos: { ...local(k.at), y: k.alt }, target: { ...local(k.look), y: 0 } })),
    settlements: s.settlements.map((st) => ({ ...local(st.at), radius: st.radius, count: st.count })),
    labels: s.labels.map((l) => ({ ...local(l.at), text: l.text, from: l.from, to: l.to })),
    checks: s.groundTruth.map((g) => ({ ...local(g.at), name: g.name, radius: g.radius, min: g.min, max: g.max })),
  };
}
