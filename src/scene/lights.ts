import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";
import type { CityLight } from "../lib/lights";
import { waveEta, type WaveParams } from "../lib/wave";
import { THEME } from "./theme";

export interface LightField {
  readonly points: Points;
  /** Number of lights still on (0..count). */
  readonly litCount: () => number;
  update(time: number, dt: number, tide: number, wave: WaveParams): void;
  reset(): void;
}

export function createLights(lights: readonly CityLight[], exaggeration: number): LightField {
  const n = lights.length;
  const pos = new Float32Array(n * 3);
  const tint = new Float32Array(n);
  const on = new Float32Array(n).fill(1);
  const dead = new Uint8Array(n);
  lights.forEach((l, i) => {
    pos[i * 3] = l.x;
    pos[i * 3 + 1] = l.ground * exaggeration + 6;
    pos[i * 3 + 2] = l.z;
    tint[i] = l.tint;
  });
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("aTint", new BufferAttribute(tint, 1));
  const onAttr = new BufferAttribute(on, 1);
  geo.setAttribute("aOn", onAttr);
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uColorA: { value: THEME.light.clone() },
      uColorB: { value: THEME.lightAlt.clone() },
      uPixelRatio: { value: Math.min(globalThis.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aTint;
      attribute float aOn;
      uniform float uPixelRatio;
      varying float vTint;
      varying float vOn;
      void main() {
        vTint = aTint;
        vOn = aOn;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp((2.0 + aTint * 2.5) * uPixelRatio * (2500.0 / -mv.z), 1.5, 18.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA, uColorB;
      varying float vTint;
      varying float vOn;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        a = a * a * vOn;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uColorA, uColorB, vTint * 0.6) * (0.9 + a), a);
      }`,
  });
  const points = new Points(geo, mat);
  points.name = "city-lights";
  points.frustumCulled = false;
  let lit = n;

  return {
    points,
    litCount: () => lit,
    update(time, dt, tide, wave) {
      lit = 0;
      for (let i = 0; i < n; i++) {
        const l = lights[i];
        if (l === undefined) continue;
        if (dead[i] === 0 && tide + waveEta(l.x, l.z, time, wave) > l.ground + 0.4) dead[i] = 1;
        const cur = on[i] ?? 1;
        // Flooded lights short-circuit with a brief flicker before going dark.
        on[i] = dead[i] === 1 ? Math.max(0, cur - dt * (1.5 + 2 * Math.random())) : Math.min(1, cur + dt * 2);
        if (dead[i] === 0) lit++;
      }
      onAttr.needsUpdate = true;
    },
    reset() {
      dead.fill(0);
      lit = n;
    },
  };
}
