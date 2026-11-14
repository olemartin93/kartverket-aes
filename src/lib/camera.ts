import type { LocalPlace } from "../data/types";
import { catmullRom, clamp, lerp, smoothstep, type Vec3 } from "./math";

export interface CameraKey {
  readonly t: number;
  readonly pos: Vec3;
  readonly target: Vec3;
}

export interface CameraPose {
  readonly pos: Vec3;
  readonly target: Vec3;
}

/** Total length of one run of the animation in seconds. */
export const DURATION = 38;

/** Minimum clearance between the camera and the ground in metres. */
export const MIN_CLEARANCE = 120;

type Places = Readonly<Record<string, LocalPlace>>;

function place(places: Places, key: string): LocalPlace {
  const p = places[key];
  if (p === undefined) throw new Error(`missing place ${key}`);
  return p;
}

/**
 * Key frames: fly in from the east along the fjord towards Ålesund (like a
 * drone), then hold a vantage point while the wave rolls in from the open sea.
 */
export function buildCameraKeys(places: Places): CameraKey[] {
  const start = place(places, "camStart");
  const m1 = place(places, "camMid1");
  const m2 = place(places, "camMid2");
  const m3 = place(places, "camMid3");
  const end = place(places, "camEnd");
  const city = place(places, "alesund");
  const sea = place(places, "waveOrigin");
  const ahead = (a: LocalPlace, b: LocalPlace, k = 1): Vec3 => ({ x: a.x + (b.x - a.x) * k, y: 0, z: a.z + (b.z - a.z) * k });
  // A point between the city and the open sea, so the wave is in frame.
  const seaward: Vec3 = { x: lerp(city.x, sea.x, 0.35), y: 0, z: lerp(city.z, sea.z, 0.35) };
  return [
    { t: 0, pos: { x: start.x, y: 900, z: start.z }, target: ahead(start, m2) },
    { t: 4, pos: { x: m1.x, y: 750, z: m1.z }, target: ahead(m1, m3) },
    { t: 8, pos: { x: m2.x, y: 620, z: m2.z }, target: { x: city.x, y: 0, z: city.z } },
    { t: 12, pos: { x: m3.x, y: 520, z: m3.z }, target: seaward },
    { t: 17, pos: { x: end.x, y: 560, z: end.z }, target: seaward },
    { t: 24, pos: { x: lerp(end.x, city.x, 0.4), y: 640, z: lerp(end.z, city.z, 0.4) + 900 }, target: { x: city.x, y: 0, z: city.z } },
    { t: 31, pos: { x: lerp(end.x, city.x, 0.6), y: 820, z: lerp(end.z, city.z, 0.6) + 1600 }, target: { x: city.x, y: 0, z: city.z } },
    { t: DURATION, pos: { x: lerp(end.x, city.x, 0.7), y: 1000, z: lerp(end.z, city.z, 0.7) + 2200 }, target: { x: city.x, y: 0, z: city.z } },
  ];
}

function interp(keys: readonly CameraKey[], t: number, pick: (k: CameraKey) => Vec3): Vec3 {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) throw new Error("no camera keys");
  const tc = clamp(t, first.t, last.t);
  let i = 0;
  while (i < keys.length - 2 && (keys[i + 1]?.t ?? Infinity) <= tc) i++;
  const k1 = keys[i] ?? first;
  const k2 = keys[i + 1] ?? last;
  const k0 = keys[i - 1] ?? k1;
  const k3 = keys[i + 2] ?? k2;
  const u = k2.t === k1.t ? 0 : smoothstep(0, 1, (tc - k1.t) / (k2.t - k1.t)) * 0.35 + ((tc - k1.t) / (k2.t - k1.t)) * 0.65;
  const [a, b, c, d] = [pick(k0), pick(k1), pick(k2), pick(k3)];
  return {
    x: catmullRom(a.x, b.x, c.x, d.x, u),
    y: catmullRom(a.y, b.y, c.y, d.y, u),
    z: catmullRom(a.z, b.z, c.z, d.z, u),
  };
}

/** Camera pose at time t. `ground` returns terrain height (m) for clearance. */
export function cameraAt(keys: readonly CameraKey[], t: number, ground: (x: number, z: number) => number): CameraPose {
  const pos = interp(keys, t, (k) => k.pos);
  const target = interp(keys, t, (k) => k.target);
  const minY = Math.max(0, ground(pos.x, pos.z)) + MIN_CLEARANCE;
  return { pos: { ...pos, y: Math.max(pos.y, minY) }, target };
}
