import { Color } from "three";

/** "Nordic dusk" palette – deliberately different from the green reference video. */
export const THEME = {
  skyZenith: new Color("#080b24"),
  skyMid: new Color("#2b2160"),
  skyHorizon: new Color("#ff7f66"),
  fog: new Color("#3a2c63"),
  sun: new Color("#ffb38a"),
  hemiSky: new Color("#7b7fd0"),
  hemiGround: new Color("#0d1020"),
  seabed: new Color("#07121f"),
  /** Elevation (m) → terrain colour stops. */
  terrain: [
    [0, new Color("#2c5a63")],
    [60, new Color("#3b6b78")],
    [200, new Color("#557197")],
    [380, new Color("#7f80b8")],
    [560, new Color("#b6afdf")],
    [760, new Color("#ece8fb")],
  ] as ReadonlyArray<readonly [number, Color]>,
  light: new Color("#ffc070"),
  lightAlt: new Color("#fff1d6"),
} as const;

/** Vertical exaggeration so the (modest) Sunnmøre relief reads well on a phone. Applied to terrain and water alike. */
export const EXAGGERATION = 1.5;

export function terrainColor(h: number, out: Color): Color {
  const stops = THEME.terrain;
  const first = stops[0];
  if (first === undefined) return out;
  if (h <= first[0]) return out.copy(first[1]);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (a === undefined || b === undefined) break;
    if (h <= b[0]) return out.copy(a[1]).lerp(b[1], (h - a[0]) / (b[0] - a[0]));
  }
  return out.copy(stops[stops.length - 1]?.[1] ?? first[1]);
}
