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
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TerrainMeta } from "../data/types";
import { buildCameraKeys, cameraAt, DURATION } from "../lib/camera";
import { sampleHeight, type Heightfield } from "../lib/heightfield";
import { generateLights } from "../lib/lights";
import { arrivalTime, makeWave, type WaveParams } from "../lib/wave";
import { smoothstep } from "../lib/math";
import { createLabel } from "./label";
import { createLights } from "./lights";
import { createSky } from "./sky";
import { createTerrain } from "./terrain";
import { EXAGGERATION, THEME } from "./theme";
import { createWater } from "./water";

export interface FrameState {
  readonly time: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly freeCamera: boolean;
  readonly lit: number;
  readonly totalLights: number;
  /** Seconds until the crest reaches Ålesund (negative after arrival). */
  readonly toArrival: number;
  readonly amplitude: number;
}

export interface WorldOptions {
  readonly canvas: HTMLCanvasElement;
  readonly hf: Heightfield;
  readonly meta: TerrainMeta;
  /** Current tide level in metres (NN2000). */
  readonly tide: number;
  readonly onFrame: (s: FrameState) => void;
  readonly reducedMotion: boolean;
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
  const { canvas, hf, meta } = opts;
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

  scene.add(createTerrain(hf));
  const water = createWater(hf, FOG_DENSITY);
  scene.add(water.mesh);

  const places = meta.places;
  const city = places["alesund"];
  const origin = places["waveOrigin"];
  if (city === undefined || origin === undefined) throw new Error("terrain metadata lacks places");
  let wave: WaveParams = makeWave(origin, city);
  water.setWave(wave);

  const lightData = generateLights(hf, places);
  const lights = createLights(lightData);
  scene.add(lights.points);

  const label = createLabel("ÅLESUND", 260);
  label.position.set(city.x, (sampleHeight(hf, city.x, city.z) + 260) * EXAGGERATION + 200, city.z);
  scene.add(label);

  const keys = buildCameraKeys(places);
  const ground = (x: number, z: number): number => sampleHeight(hf, x, z) * EXAGGERATION;
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 300;
  controls.maxDistance = 40_000;

  let time = 0;
  let playing = true;
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
    camera.position.set(pose.pos.x, pose.pos.y * EXAGGERATION, pose.pos.z);
    const target = new Vector3(pose.target.x, pose.target.y, pose.target.z);
    if (firstFrame) smoothTarget.copy(target);
    else smoothTarget.lerp(target, 1 - Math.exp(-dt * 2.5));
    firstFrame = false;
    camera.lookAt(smoothTarget);
  };

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) {
      time += dt * (opts.reducedMotion ? 0.6 : 1);
      if (time >= DURATION) {
        time = DURATION;
        endHold += dt;
        if (endHold > 3) restartInternal();
      }
    }
    water.update(time, opts.tide);
    lights.update(time, dt, opts.tide, wave);
    const labelMat = label.material;
    labelMat.opacity = smoothstep(4, 7, time) * (1 - smoothstep(19, 22, time));
    if (freeCamera) controls.update();
    else applyCinematicCamera(dt);
    renderer.render(scene, camera);
    opts.onFrame({
      time,
      duration: DURATION,
      playing,
      freeCamera,
      lit: lights.litCount(),
      totalLights: lightData.length,
      toArrival: arrivalTime(city, wave) - time,
      amplitude: wave.amplitude,
    });
  };

  const restartInternal = (): void => {
    time = 0;
    endHold = 0;
    firstFrame = true;
    lights.reset();
  };

  raf = requestAnimationFrame(frame);

  return {
    play() {
      if (time >= DURATION) restartInternal();
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
      renderer.dispose();
    },
  };
}
