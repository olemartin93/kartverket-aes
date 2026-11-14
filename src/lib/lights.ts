import type { LocalPlace } from "../data/types";
import { isLandAt, sampleHeight, type Heightfield } from "./heightfield";
import { mulberry32 } from "./math";

export interface CityLight {
  readonly x: number;
  readonly z: number;
  /** Ground elevation in metres. */
  readonly ground: number;
  /** 0..1, used for colour/size variation. */
  readonly tint: number;
}

/** Settlements and how many (illustrative) lights to scatter around each. */
export const SETTLEMENTS: ReadonlyArray<{ key: string; radius: number; count: number }> = [
  { key: "alesund", radius: 2600, count: 1600 },
  { key: "spjelkavik", radius: 2600, count: 900 },
  { key: "langevag", radius: 1400, count: 350 },
  { key: "valderoy", radius: 1800, count: 400 },
  { key: "vigra", radius: 1500, count: 260 },
  { key: "hareid", radius: 1500, count: 320 },
];

/**
 * Scatter lights on low, gentle land around settlements. Purely decorative:
 * positions are random (seeded) but constrained by Kartverket's elevation.
 */
export function generateLights(hf: Heightfield, places: Readonly<Record<string, LocalPlace>>, seed = 1337): CityLight[] {
  const rnd = mulberry32(seed);
  const lights: CityLight[] = [];
  for (const s of SETTLEMENTS) {
    const c = places[s.key];
    if (c === undefined) continue;
    let placed = 0;
    for (let attempt = 0; attempt < s.count * 12 && placed < s.count; attempt++) {
      // Box–Muller for a dense centre that thins out.
      const r = Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * s.radius * 0.45;
      const a = rnd() * Math.PI * 2;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (!isLandAt(hf, x, z)) continue;
      const g = sampleHeight(hf, x, z);
      if (g < 0.5 || g > 90) continue;
      const slope = Math.abs(sampleHeight(hf, x + 40, z) - sampleHeight(hf, x - 40, z)) + Math.abs(sampleHeight(hf, x, z + 40) - sampleHeight(hf, x, z - 40));
      if (slope > 45) continue;
      lights.push({ x, z, ground: g, tint: rnd() });
      placed++;
    }
  }
  return lights;
}
