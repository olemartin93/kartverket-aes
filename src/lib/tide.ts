import type { TideData } from "../data/types";

export interface TideReading {
  /** Water level in metres above NN2000. */
  readonly metres: number;
  /** True when `date` lies inside the downloaded prediction window. */
  readonly inRange: boolean;
}

/** Linear interpolation of Kartverket's predicted water level at `date`. */
export function tideAt(tide: TideData, date: Date): TideReading {
  const start = Date.parse(tide.start);
  const step = tide.intervalMinutes * 60_000;
  const f = (date.getTime() - start) / step;
  const n = tide.values.length;
  if (n === 0) return { metres: 0, inRange: false };
  if (f < 0 || f > n - 1) {
    const edge = f < 0 ? tide.values[0] : tide.values[n - 1];
    return { metres: (edge ?? 0) / 100, inRange: false };
  }
  const i = Math.floor(f);
  const a = tide.values[i] ?? 0;
  const b = tide.values[Math.min(i + 1, n - 1)] ?? a;
  return { metres: (a + (b - a) * (f - i)) / 100, inRange: true };
}

/** Next high and low water after `date`, using the hourly series. */
export function nextExtremes(tide: TideData, date: Date): { high?: Date; low?: Date } {
  const start = Date.parse(tide.start);
  const step = tide.intervalMinutes * 60_000;
  const from = Math.max(1, Math.ceil((date.getTime() - start) / step));
  const out: { high?: Date; low?: Date } = {};
  for (let i = from; i < tide.values.length - 1 && (out.high === undefined || out.low === undefined); i++) {
    const p = tide.values[i - 1] ?? 0;
    const c = tide.values[i] ?? 0;
    const nx = tide.values[i + 1] ?? 0;
    if (out.high === undefined && c >= p && c > nx) out.high = new Date(start + i * step);
    if (out.low === undefined && c <= p && c < nx) out.low = new Date(start + i * step);
  }
  return out;
}
