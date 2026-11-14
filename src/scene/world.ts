import {
  ACESFilmicToneMapping,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Sprite,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Scenario } from "../data/scenarios";
import type { TerrainMeta } from "../data/types";
import { cameraAt, cameraKeys, duration } from "../lib/camera";
import { sampleHeight, type Heightfield } from "../lib/heightfield";
import { generateLights } from "../lib/lights";
import { smoothstep } from "../lib/math";
import { arrivalTime, makeWave, type WaveParams } from "../lib/wave";
import { createLabel } from "./label";
import { createLights } from "./lights";
import { createSky } from "./sky";
import { createTerrain } from "./terrain";
import { THEME } from "./theme";
import { createWater } from "./water";

export interface FrameState {
  readonly scenario: string;
  readonly time: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly freeCamera: boolean;
  readonly lit: number;
  readonly totalLights: number;
  /** Seconds until the crest reaches the city (negative after arrival). */
  readonly toArrival: number;
  readonly amplitude: number;
}

export interface WorldOptions {
  readonly canvas: HTMLCanvasElement;
  readonly scenario: Scenario;
  readonly hf: Heightfield;
  readonly meta: TerrainMeta;
  /** Current tide level in metres (NN2000). */
  readonly tide: number;
  readonly amplitude: number;
  readonly onFrame: (s: FrameState) => void;
  readonly reducedMotion: boolean;
  /** Animation time (s) to start from, e.g. from the `?t=` URL parameter. */
  readonly initialTime?: number;
  readonly startPaused?: boolean;
}

export interface World {
  play(): void;
  pause(): void;
  restart(): void;
  setAmplitude(m: number): void;
  setFreeCamera(on: boolean): void;
  dispose(): void;
}

const FOG_DENSITY = 0.000032;

export function createWorld(opts: WorldOptions): World {
  const { canvas, hf, meta, scenario } = opts;
  const exag = scenario.exaggeration;
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new Scene();
  scene.fog = new FogExp2(THEME.fog, FOG_DENSITY);
  const camera = new PerspectiveCamera(55, 1, 20, 120_000);

  const sunDir = new Vector3(-0.6, 0.18, -0.75).normalize();
  scene.add(createSky(100_000, sunDir));
  scene.add(new HemisphereLight(THEME.hemiSky, THEME.hemiGround, 1.6));
  const sun = new DirectionalLight(THEME.sun, 2.8);
  sun.position.copy(sunDir).multiplyScalar(30_000);
  scene.add(sun);

  scene.add(createTerrain(hf, exag));
  const water = createWater(hf, FOG_DENSITY, exag);
  scene.add(water.mesh);

  const geo = meta.scene;
  let wave: WaveParams = makeWave(geo.waveOrigin, geo.city, { ...scenario.wave, amplitude: opts.amplitude });
  water.setWave(wave);

  const lightData = generateLights(hf, geo.settlements);
  const lights = createLights(lightData, exag);
  scene.add(lights.points);

  const labels: { sprite: Sprite; from: number; to: number }[] = geo.labels.map((l) => {
    const sprite = createLabel(l.text, 260);
    sprite.position.set(l.x, (Math.max(0, sampleHeight(hf, l.x, l.z)) + 260) * exag + 200, l.z);
    scene.add(sprite);
    return { sprite, from: l.from, to: l.to };
  });

  const keys = cameraKeys(geo);
  const total = duration(keys);
  const ground = (x: number, z: number): number => sampleHeight(hf, x, z);
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 300;
  controls.maxDistance = 40_000;

  let time = Math.min(opts.initialTime ?? 0, total);
  let playing = opts.startPaused !== true;
  let freeCamera = false;
  let last = performance.now();
  let raf = 0;
  let endHold = 0;
  const smoothTarget = new Vector3();
  let firstFrame = true;

  const resize = (): void => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait phones need a wider vertical FOV to keep the scene in view.
    camera.fov = camera.aspect < 0.8 ? 70 : 55;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const applyCinematicCamera = (dt: number): void => {
    const pose = cameraAt(keys, time, ground);
    camera.position.set(pose.pos.x, pose.pos.y * exag, pose.pos.z);
    const target = new Vector3(pose.target.x, pose.target.y, pose.target.z);
    if (firstFrame) smoothTarget.copy(target);
    else smoothTarget.lerp(target, 1 - Math.exp(-dt * 2.5));
    firstFrame = false;
    camera.lookAt(smoothTarget);
  };

  const restartInternal = (): void => {
    time = 0;
    endHold = 0;
    firstFrame = true;
    lights.reset();
  };

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) {
      time += dt * (opts.reducedMotion ? 0.6 : 1);
      if (time >= total) {
        time = total;
        endHold += dt;
        if (endHold > 3) restartInternal();
      }
    }
    water.update(time, opts.tide);
    lights.update(time, dt, opts.tide, wave);
    for (const l of labels) {
      l.sprite.material.opacity = smoothstep(l.from, l.from + 2, time) * (1 - smoothstep(l.to - 2, l.to, time));
    }
    if (freeCamera) controls.update();
    else applyCinematicCamera(dt);
    renderer.render(scene, camera);
    opts.onFrame({
      scenario: scenario.id,
      time,
      duration: total,
      playing,
      freeCamera,
      lit: lights.litCount(),
      totalLights: lightData.length,
      toArrival: arrivalTime(geo.city, wave) - time,
      amplitude: wave.amplitude,
    });
  };

  raf = requestAnimationFrame(frame);

  return {
    play() {
      if (time >= total) restartInternal();
      playing = true;
    },
    pause() {
      playing = false;
    },
    restart() {
      restartInternal();
      playing = true;
    },
    setAmplitude(m) {
      wave = { ...wave, amplitude: m };
      water.setWave(wave);
    },
    setFreeCamera(on) {
      freeCamera = on;
      controls.enabled = on;
      if (on) controls.target.copy(smoothTarget);
      else firstFrame = true;
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      controls.dispose();
      scene.traverse((o) => {
        const obj = o as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        for (const m of mats) m.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
