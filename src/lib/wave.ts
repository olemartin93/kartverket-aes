import { normalize2, smoothstep, type Vec2 } from "./math";

/**
 * A stylised, *illustrative* tsunami model: a solitary crest travelling in a
 * straight line, preceded by a draw-down and followed by a flooded plateau
 * that later recedes. It is not a hazard simulation.
 *
 * Keep in sync with the GLSL version in src/scene/water.ts.
 */
export interface WaveParams {
  /** Crest height above the tide in metres. */
  readonly amplitude: number;
  /** Crest half-width in metres. */
  readonly width: number;
  /** Front speed in metres per (animation) second. Time-lapsed. */
  readonly speed: number;
  readonly origin: Vec2;
  /** Unit direction of travel. */
  readonly dir: Vec2;
  /** Animation time (s) when the wave starts at its origin. */
  readonly startTime: number;
  /** Fraction of the amplitude that stays on land behind the crest. */
  readonly inundation: number;
  readonly recedeStart: number;
  readonly recedeDuration: number;
}

export function makeWave(origin: Vec2, target: Vec2, overrides: Partial<WaveParams> = {}): WaveParams {
  const dir = normalize2({ x: target.x - origin.x, z: target.z - origin.z });
  return {
    amplitude: 28,
    width: 650,
    speed: 1500,
    origin,
    dir,
    startTime: 8,
    inundation: 0.55,
    recedeStart: 27,
    recedeDuration: 7,
    ...overrides,
  };
}

/** Distance the front has travelled from its origin at time t. */
export function frontDistance(t: number, p: WaveParams): number {
  return (t - p.startTime) * p.speed;
}

/** Time at which the crest reaches point q. */
export function arrivalTime(q: Vec2, p: WaveParams): number {
  const s = (q.x - p.origin.x) * p.dir.x + (q.z - p.origin.z) * p.dir.z;
  return p.startTime + s / p.speed;
}

/** Water surface elevation above the tide (m) at (x, z) and time t. */
export function waveEta(x: number, z: number, t: number, p: WaveParams): number {
  if (t < p.startTime) return 0;
  const s = (x - p.origin.x) * p.dir.x + (z - p.origin.z) * p.dir.z;
  const d = s - frontDistance(t, p);
  const w = p.width;
  const crest = Math.exp(-((d / w) ** 2));
  const behind = 1 / (1 + Math.exp(d / (w * 0.6)));
  const drawdown = -0.2 * Math.exp(-(((d - 2.2 * w) / w) ** 2));
  const recede = 1 - smoothstep(p.recedeStart, p.recedeStart + p.recedeDuration, t);
  const ramp = smoothstep(p.startTime, p.startTime + 2, t);
  const shape = Math.max(crest, p.inundation * behind) + drawdown;
  return p.amplitude * shape * recede * ramp;
}
