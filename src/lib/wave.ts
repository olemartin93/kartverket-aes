import { normalize2, smoothstep, type Vec2 } from "./math";

/**
 * A stylised, *illustrative* tsunami model. Either a straight front from the
 * open sea ("plane") or a ring spreading from a point such as a rock slide
 * ("radial"). The crest is preceded by a draw-down and followed by a flooded
 * plateau that later recedes. It is not a hazard simulation.
 *
 * Keep in sync with the GLSL version in src/scene/water.ts.
 */
export interface WaveParams {
  readonly kind: "plane" | "radial";
  /** Crest height above the tide in metres (at `RADIAL_R0` for radial waves). */
  readonly amplitude: number;
  /** Crest half-width in metres. */
  readonly width: number;
  /** Front speed in metres per (animation) second. Time-lapsed. */
  readonly speed: number;
  readonly origin: Vec2;
  /** Unit direction of travel (plane waves). */
  readonly dir: Vec2;
  /** Animation time (s) when the wave starts at its origin. */
  readonly startTime: number;
  /** Fraction of the amplitude that stays on land behind the crest. */
  readonly inundation: number;
  readonly recedeStart: number;
  readonly recedeDuration: number;
}

/** Radial waves keep their full height out to this distance, then decay ~1/√r. */
export const RADIAL_R0 = 4000;

export interface WaveTiming {
  readonly kind: "plane" | "radial";
  readonly amplitude: number;
  readonly width: number;
  readonly startTime: number;
  readonly arriveAt: number;
  readonly inundation: number;
  readonly recedeStart: number;
  readonly recedeDuration: number;
}

/** Builds wave parameters so that the crest reaches `target` at `spec.arriveAt`. */
export function makeWave(origin: Vec2, target: Vec2, spec: WaveTiming): WaveParams {
  const dist = Math.hypot(target.x - origin.x, target.z - origin.z);
  if (!(spec.arriveAt > spec.startTime)) throw new Error("arriveAt must be after startTime");
  return {
    kind: spec.kind,
    amplitude: spec.amplitude,
    width: spec.width,
    speed: dist / (spec.arriveAt - spec.startTime),
    origin,
    dir: normalize2({ x: target.x - origin.x, z: target.z - origin.z }),
    startTime: spec.startTime,
    inundation: spec.inundation,
    recedeStart: spec.recedeStart,
    recedeDuration: spec.recedeDuration,
  };
}

/** Distance the front has travelled from its origin at time t. */
export function frontDistance(t: number, p: WaveParams): number {
  return (t - p.startTime) * p.speed;
}

/** Distance of point q from the origin along the wave's path. */
export function pathDistance(x: number, z: number, p: WaveParams): number {
  return p.kind === "radial"
    ? Math.hypot(x - p.origin.x, z - p.origin.z)
    : (x - p.origin.x) * p.dir.x + (z - p.origin.z) * p.dir.z;
}

/** Time at which the crest reaches point q. */
export function arrivalTime(q: Vec2, p: WaveParams): number {
  return p.startTime + pathDistance(q.x, q.z, p) / p.speed;
}

/** Water surface elevation above the tide (m) at (x, z) and time t. */
export function waveEta(x: number, z: number, t: number, p: WaveParams): number {
  if (t < p.startTime) return 0;
  const s = pathDistance(x, z, p);
  const d = s - frontDistance(t, p);
  const w = p.width;
  const crest = Math.exp(-((d / w) ** 2));
  const behind = 1 / (1 + Math.exp(Math.max(-40, Math.min(40, d / (w * 0.6)))));
  const drawdown = -0.2 * Math.exp(-(((d - 2.2 * w) / w) ** 2));
  const recede = 1 - smoothstep(p.recedeStart, p.recedeStart + p.recedeDuration, t);
  const ramp = smoothstep(p.startTime, p.startTime + 2, t);
  const decay = p.kind === "radial" ? Math.sqrt(RADIAL_R0 / Math.max(s, RADIAL_R0)) : 1;
  const shape = Math.max(crest, p.inundation * behind) + drawdown;
  return p.amplitude * decay * shape * recede * ramp;
}
