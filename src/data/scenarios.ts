import type { LatLon } from "./places";

/**
 * Scenario catalogue. Every scenario is rendered from Kartverket's terrain
 * model and tide predictions for its own area (downloaded at build time).
 *
 * The waves are illustrative. Only Åkneset (Geiranger) is based on a real,
 * monitored hazard; the others are fictional "what if" scenarios.
 */

export interface CameraKeySpec {
  /** Animation time in seconds. */
  readonly t: number;
  readonly at: LatLon;
  /** Camera altitude in metres above NN2000 (before exaggeration). */
  readonly alt: number;
  readonly look: LatLon;
}

export interface GroundTruth {
  /** Human-readable name, e.g. "Aksla (≈189 m)". */
  readonly name: string;
  readonly at: LatLon;
  /** Search radius in metres for the highest cell. */
  readonly radius: number;
  readonly min: number;
  readonly max: number;
}

export interface WaveSpec {
  /** "plane": a straight front from the open sea. "radial": a point source such as a rock slide. */
  readonly kind: "plane" | "radial";
  readonly origin: LatLon;
  /** Default crest height in metres. */
  readonly amplitude: number;
  /** Crest half-width in metres. */
  readonly width: number;
  readonly startTime: number;
  /** Animation time when the crest reaches the city. Sets the (time-lapsed) speed. */
  readonly arriveAt: number;
  readonly inundation: number;
  readonly recedeStart: number;
  readonly recedeDuration: number;
}

export interface Settlement {
  readonly at: LatLon;
  readonly radius: number;
  readonly count: number;
}

export interface LabelSpec {
  readonly at: LatLon;
  readonly text: string;
  readonly from: number;
  readonly to: number;
}

export interface Scenario {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  /** One-line teaser shown in the place picker. */
  readonly blurb: string;
  /** Extra context shown in the About sheet. */
  readonly note: string;
  /** True when the scenario reflects a real, monitored hazard. */
  readonly realHazard: boolean;
  readonly area: { readonly south: number; readonly north: number; readonly west: number; readonly east: number };
  /** Target ground resolution in metres. */
  readonly cellSize: number;
  readonly exaggeration: number;
  /** Where the wave is measured as "arriving" and where tide is predicted. */
  readonly city: LatLon & { readonly name: string };
  readonly wave: WaveSpec;
  readonly camera: readonly CameraKeySpec[];
  readonly settlements: readonly Settlement[];
  readonly labels: readonly LabelSpec[];
  /** Known heights used to verify the downloaded terrain. */
  readonly groundTruth: readonly GroundTruth[];
}

const ll = (lat: number, lon: number): LatLon => ({ lat, lon });

const alesund: Scenario = {
  id: "alesund",
  name: "Ålesund",
  region: "Sunnmøre",
  blurb: "Fly along the fjord to the Art Nouveau town as a wave rolls in from the open sea.",
  note: "Fictional scenario. A wave from the open sea north-west of Ålesund, loosely inspired by the prehistoric Storegga tsunami that struck this coast about 8,150 years ago.",
  realHazard: false,
  area: { south: 62.33, north: 62.58, west: 5.9, east: 6.6 },
  cellSize: 60,
  exaggeration: 1.5,
  city: { name: "Ålesund", lat: 62.4723, lon: 6.1549 },
  wave: {
    kind: "plane",
    origin: ll(62.58, 5.9),
    amplitude: 28,
    width: 650,
    startTime: 8,
    arriveAt: 20,
    inundation: 0.55,
    recedeStart: 27,
    recedeDuration: 7,
  },
  camera: [
    { t: 0, at: ll(62.43, 6.56), alt: 900, look: ll(62.456, 6.3) },
    { t: 4, at: ll(62.452, 6.43), alt: 750, look: ll(62.464, 6.22) },
    { t: 8, at: ll(62.456, 6.3), alt: 620, look: ll(62.4723, 6.1549) },
    { t: 12, at: ll(62.464, 6.22), alt: 520, look: ll(62.51, 6.07) },
    { t: 17, at: ll(62.456, 6.19), alt: 560, look: ll(62.51, 6.07) },
    { t: 24, at: ll(62.452, 6.176), alt: 640, look: ll(62.4723, 6.1549) },
    { t: 31, at: ll(62.447, 6.17), alt: 820, look: ll(62.4723, 6.1549) },
    { t: 38, at: ll(62.442, 6.168), alt: 1000, look: ll(62.4723, 6.1549) },
  ],
  settlements: [
    { at: ll(62.4723, 6.1549), radius: 2600, count: 1600 },
    { at: ll(62.461, 6.383), radius: 2600, count: 900 },
    { at: ll(62.443, 6.205), radius: 1400, count: 350 },
    { at: ll(62.493, 6.12), radius: 1800, count: 400 },
    { at: ll(62.555, 6.09), radius: 1500, count: 260 },
    { at: ll(62.37, 6.03), radius: 1500, count: 320 },
  ],
  labels: [{ at: ll(62.4723, 6.1549), text: "ÅLESUND", from: 4, to: 22 }],
  groundTruth: [{ name: "Aksla (≈189 m)", at: ll(62.4733, 6.1622), radius: 500, min: 100, max: 260 }],
};

const geiranger: Scenario = {
  id: "geiranger",
  name: "Geiranger",
  region: "Åkneset rock slide",
  blurb: "The unstable Åkneset slope collapses into Sunnylvsfjorden and a wave races into Geirangerfjorden.",
  note: "Åkneset is one of Norway's most closely monitored unstable rock slopes. NVE's published scenarios describe a slide-generated tsunami reaching Hellesylt and Geiranger within minutes, with run-up of several tens of metres. This animation is a stylised illustration, not NVE's model.",
  realHazard: true,
  area: { south: 61.99, north: 62.33, west: 6.7, east: 7.3 },
  cellSize: 50,
  exaggeration: 1.0,
  city: { name: "Geiranger", lat: 62.1008, lon: 7.2059 },
  wave: {
    kind: "radial",
    origin: ll(62.183, 6.993),
    amplitude: 35,
    width: 450,
    startTime: 9,
    arriveAt: 22,
    inundation: 0.5,
    recedeStart: 29,
    recedeDuration: 7,
  },
  camera: [
    { t: 0, at: ll(62.30, 6.97), alt: 2000, look: ll(62.183, 6.993) },
    { t: 6, at: ll(62.23, 6.975), alt: 1800, look: ll(62.183, 6.993) },
    { t: 11, at: ll(62.17, 6.94), alt: 1700, look: ll(62.12, 7.02) },
    { t: 16, at: ll(62.125, 7.0), alt: 1650, look: ll(62.105, 7.15) },
    { t: 22, at: ll(62.11, 7.1), alt: 1600, look: ll(62.1008, 7.2059) },
    { t: 30, at: ll(62.09, 7.16), alt: 1500, look: ll(62.1008, 7.2059) },
    { t: 38, at: ll(62.08, 7.13), alt: 1700, look: ll(62.1008, 7.2059) },
  ],
  settlements: [
    { at: ll(62.1008, 7.2059), radius: 900, count: 260 },
    { at: ll(62.0846, 6.8717), radius: 800, count: 220 },
    { at: ll(62.3087, 6.9452), radius: 1300, count: 380 },
  ],
  labels: [
    { at: ll(62.183, 6.993), text: "ÅKNESET", from: 2, to: 12 },
    { at: ll(62.0846, 6.8717), text: "HELLESYLT", from: 10, to: 18 },
    { at: ll(62.1008, 7.2059), text: "GEIRANGER", from: 15, to: 26 },
  ],
  groundTruth: [{ name: "Dalsnibba (≈1476 m)", at: ll(62.045, 7.273), radius: 2500, min: 1250, max: 1600 }],
};

const oslo: Scenario = {
  id: "oslo",
  name: "Oslo",
  region: "Oslofjorden",
  blurb: "A wave surges up the inner Oslofjord towards the Opera, City Hall and Aker Brygge.",
  note: "Fictional scenario. The inner Oslofjord is sheltered and has no realistic tsunami source of this size; vertical relief is exaggerated ×2 so the gentle hills read on a phone.",
  realHazard: false,
  area: { south: 59.8, north: 60.0, west: 10.55, east: 10.9 },
  cellSize: 50,
  exaggeration: 2.0,
  city: { name: "Oslo", lat: 59.9112, lon: 10.7339 },
  wave: {
    kind: "plane",
    origin: ll(59.79, 10.64),
    amplitude: 18,
    width: 500,
    startTime: 8,
    arriveAt: 20,
    inundation: 0.55,
    recedeStart: 27,
    recedeDuration: 7,
  },
  camera: [
    { t: 0, at: ll(59.81, 10.7), alt: 800, look: ll(59.9112, 10.7339) },
    { t: 5, at: ll(59.85, 10.71), alt: 700, look: ll(59.9112, 10.7339) },
    { t: 10, at: ll(59.88, 10.74), alt: 600, look: ll(59.9112, 10.7339) },
    { t: 15, at: ll(59.895, 10.78), alt: 520, look: ll(59.86, 10.69) },
    { t: 21, at: ll(59.9, 10.79), alt: 560, look: ll(59.9112, 10.7339) },
    { t: 30, at: ll(59.89, 10.8), alt: 700, look: ll(59.9112, 10.7339) },
    { t: 38, at: ll(59.88, 10.81), alt: 900, look: ll(59.9112, 10.7339) },
  ],
  settlements: [
    { at: ll(59.9139, 10.7522), radius: 3500, count: 2400 },
    { at: ll(59.925, 10.79), radius: 2500, count: 900 },
    { at: ll(59.913, 10.64), radius: 1500, count: 400 },
    { at: ll(59.866, 10.656), radius: 1500, count: 280 },
    { at: ll(59.88, 10.81), radius: 1800, count: 400 },
  ],
  labels: [{ at: ll(59.9112, 10.7339), text: "OSLO", from: 4, to: 22 }],
  groundTruth: [{ name: "Tryvannshøgda (≈529 m)", at: ll(59.985, 10.669), radius: 1500, min: 430, max: 600 }],
};

const trondheim: Scenario = {
  id: "trondheim",
  name: "Trondheim",
  region: "Trondheimsfjorden",
  blurb: "A wave rolls in past Munkholmen towards Nidaros Cathedral and Bakklandet.",
  note: "Fictional scenario. Trondheimsfjorden has seen local slide-generated waves (e.g. 1888), but nothing like this.",
  realHazard: false,
  area: { south: 63.36, north: 63.52, west: 10.15, east: 10.6 },
  cellSize: 50,
  exaggeration: 1.6,
  city: { name: "Trondheim", lat: 63.4305, lon: 10.3951 },
  wave: {
    kind: "plane",
    origin: ll(63.53, 10.15),
    amplitude: 22,
    width: 550,
    startTime: 8,
    arriveAt: 20,
    inundation: 0.55,
    recedeStart: 27,
    recedeDuration: 7,
  },
  camera: [
    { t: 0, at: ll(63.47, 10.58), alt: 900, look: ll(63.4305, 10.3951) },
    { t: 5, at: ll(63.46, 10.5), alt: 800, look: ll(63.4305, 10.3951) },
    { t: 10, at: ll(63.45, 10.45), alt: 700, look: ll(63.4513, 10.3826) },
    { t: 15, at: ll(63.44, 10.43), alt: 620, look: ll(63.47, 10.3) },
    { t: 21, at: ll(63.425, 10.43), alt: 640, look: ll(63.4305, 10.3951) },
    { t: 30, at: ll(63.415, 10.44), alt: 780, look: ll(63.4305, 10.3951) },
    { t: 38, at: ll(63.405, 10.45), alt: 950, look: ll(63.4305, 10.3951) },
  ],
  settlements: [
    { at: ll(63.4305, 10.3951), radius: 3200, count: 2200 },
    { at: ll(63.43, 10.53), radius: 1500, count: 350 },
    { at: ll(63.41, 10.33), radius: 1800, count: 500 },
  ],
  labels: [{ at: ll(63.4305, 10.3951), text: "TRONDHEIM", from: 4, to: 22 }],
  groundTruth: [{ name: "Gråkallen (≈552 m)", at: ll(63.418, 10.247), radius: 2000, min: 450, max: 620 }],
};

const bergen: Scenario = {
  id: "bergen",
  name: "Bergen",
  region: "Byfjorden",
  blurb: "A wave sweeps down Byfjorden into Vågen and over Bryggen, between the seven mountains.",
  note: "Fictional scenario. The wave comes in from the north-west through Byfjorden.",
  realHazard: false,
  area: { south: 60.32, north: 60.46, west: 5.15, east: 5.45 },
  cellSize: 40,
  exaggeration: 1.3,
  city: { name: "Bergen", lat: 60.3975, lon: 5.324 },
  wave: {
    kind: "plane",
    origin: ll(60.465, 5.15),
    amplitude: 22,
    width: 450,
    startTime: 8,
    arriveAt: 20,
    inundation: 0.55,
    recedeStart: 27,
    recedeDuration: 7,
  },
  camera: [
    { t: 0, at: ll(60.355, 5.43), alt: 1100, look: ll(60.3975, 5.324) },
    { t: 5, at: ll(60.37, 5.4), alt: 950, look: ll(60.3975, 5.324) },
    { t: 10, at: ll(60.385, 5.37), alt: 800, look: ll(60.3975, 5.324) },
    { t: 15, at: ll(60.39, 5.35), alt: 650, look: ll(60.42, 5.25) },
    { t: 21, at: ll(60.385, 5.345), alt: 650, look: ll(60.3975, 5.324) },
    { t: 30, at: ll(60.378, 5.35), alt: 800, look: ll(60.3975, 5.324) },
    { t: 38, at: ll(60.37, 5.355), alt: 1000, look: ll(60.3975, 5.324) },
  ],
  settlements: [
    { at: ll(60.392, 5.324), radius: 2500, count: 1800 },
    { at: ll(60.415, 5.315), radius: 1200, count: 350 },
    { at: ll(60.385, 5.3), radius: 1500, count: 450 },
    { at: ll(60.408, 5.226), radius: 1500, count: 350 },
  ],
  labels: [{ at: ll(60.3975, 5.324), text: "BERGEN", from: 4, to: 22 }],
  groundTruth: [{ name: "Ulriken (≈643 m)", at: ll(60.378, 5.387), radius: 1200, min: 540, max: 700 }],
};

const lofoten: Scenario = {
  id: "lofoten",
  name: "Reine",
  region: "Lofoten",
  blurb: "Jagged peaks, red rorbuer and a wave rolling in from Vestfjorden towards Reine and Hamnøy.",
  note: "Fictional scenario. Relief is shown at true scale – Lofoten's peaks need no exaggeration.",
  realHazard: false,
  area: { south: 67.84, north: 68.02, west: 12.85, east: 13.3 },
  cellSize: 40,
  exaggeration: 1.0,
  city: { name: "Reine", lat: 67.933, lon: 13.089 },
  wave: {
    kind: "plane",
    origin: ll(67.85, 13.32),
    amplitude: 25,
    width: 500,
    startTime: 8,
    arriveAt: 20,
    inundation: 0.55,
    recedeStart: 27,
    recedeDuration: 7,
  },
  camera: [
    { t: 0, at: ll(67.875, 13.26), alt: 1100, look: ll(67.933, 13.089) },
    { t: 5, at: ll(67.895, 13.2), alt: 950, look: ll(67.933, 13.089) },
    { t: 10, at: ll(67.91, 13.15), alt: 850, look: ll(67.933, 13.089) },
    { t: 15, at: ll(67.915, 13.11), alt: 800, look: ll(67.9, 13.25) },
    { t: 21, at: ll(67.915, 13.1), alt: 800, look: ll(67.933, 13.089) },
    { t: 30, at: ll(67.91, 13.11), alt: 900, look: ll(67.94, 13.1) },
    { t: 38, at: ll(67.9, 13.12), alt: 1100, look: ll(67.94, 13.1) },
  ],
  settlements: [
    { at: ll(67.933, 13.089), radius: 700, count: 160 },
    { at: ll(67.948, 13.133), radius: 600, count: 90 },
    { at: ll(67.943, 13.113), radius: 400, count: 50 },
    { at: ll(67.899, 13.057), radius: 700, count: 120 },
    { at: ll(67.887, 13.028), radius: 600, count: 100 },
  ],
  labels: [{ at: ll(67.933, 13.089), text: "REINE", from: 4, to: 22 }],
  groundTruth: [{ name: "Moskenesøya peaks (≈1000 m)", at: ll(67.94, 13.02), radius: 9000, min: 750, max: 1150 }],
};

export const SCENARIOS: readonly Scenario[] = [alesund, geiranger, oslo, trondheim, bergen, lofoten];

export const DEFAULT_SCENARIO = "alesund";

export function findScenario(id: string | null | undefined): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? (SCENARIOS[0] as Scenario);
}
