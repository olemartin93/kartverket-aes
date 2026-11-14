import type { SceneGeometry } from "../data/types";
import { catmullRom, clamp, smoothstep, type Vec3 } from "./math";

export interface CameraKey {
  readonly t: number;
  readonly pos: Vec3;
  readonly target: Vec3;
}

export interface CameraPose {
  readonly pos: Vec3;
  readonly target: Vec3;
}

/** Minimum clearance between the camera and the ground in metres. */
export const MIN_CLEARANCE = 120;

export function cameraKeys(scene: SceneGeometry): CameraKey[] {
  const keys = scene.camera.map((k) => ({ t: k.t, pos: k.pos, target: k.target }));
  for (let i = 1; i < keys.length; i++) {
    if ((keys[i]?.t ?? 0) <= (keys[i - 1]?.t ?? 0)) throw new Error("camera key times must increase");
  }
  return keys;
}

/** Length of the animation: the time of the last camera key. */
export function duration(keys: readonly CameraKey[]): number {
  return keys[keys.length - 1]?.t ?? 0;
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
  const lin = k2.t === k1.t ? 0 : (tc - k1.t) / (k2.t - k1.t);
  const u = smoothstep(0, 1, lin) * 0.35 + lin * 0.65;
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
