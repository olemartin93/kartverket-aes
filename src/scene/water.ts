import {
  DataTexture,
  DataUtils,
  DoubleSide,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import type { Heightfield } from "../lib/heightfield";
import type { WaveParams } from "../lib/wave";
import { EXAGGERATION, THEME } from "./theme";

const vertexShader = /* glsl */ `
uniform float uTime, uTide, uAmp, uWidth, uSpeed, uStart, uInund, uRecStart, uRecDur, uExag;
uniform vec2 uOrigin, uDir, uSize;
uniform sampler2D uHeight;
varying vec3 vWorld;
varying float vDepth;
varying float vCrest;

// Mirror of waveEta() in src/lib/wave.ts
float waveEta(vec2 p, float t) {
  if (t < uStart) return 0.0;
  float s = dot(p - uOrigin, uDir);
  float d = s - (t - uStart) * uSpeed;
  float crest = exp(-pow(d / uWidth, 2.0));
  float behind = 1.0 / (1.0 + exp(clamp(d / (uWidth * 0.6), -40.0, 40.0)));
  float drawdown = -0.2 * exp(-pow((d - 2.2 * uWidth) / uWidth, 2.0));
  float recede = 1.0 - smoothstep(uRecStart, uRecStart + uRecDur, t);
  float ramp = smoothstep(uStart, uStart + 2.0, t);
  return uAmp * (max(crest, uInund * behind) + drawdown) * recede * ramp;
}

void main() {
  vec3 pos = position;
  float eta = uTide + waveEta(pos.xz, uTime);
  float ripple = 0.35 * sin(pos.x * 0.021 + uTime * 1.3) * sin(pos.z * 0.017 - uTime * 1.1);
  vec2 uv = (pos.xz + uSize * 0.5) / uSize;
  float ground = texture2D(uHeight, uv).r;
  vDepth = eta - ground;
  vCrest = (eta - uTide) / max(uAmp, 1.0);
  pos.y = (eta + ripple) * uExag;
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uFogColor, uSunDir, uSun;
uniform float uFogDensity, uTime;
varying vec3 vWorld;
varying float vDepth;
varying float vCrest;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  if (vDepth < -0.5) discard;
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 deep = vec3(0.01, 0.10, 0.22);
  vec3 shallow = vec3(0.02, 0.48, 0.58);
  vec3 col = mix(shallow, deep, smoothstep(0.0, 30.0, vDepth));
  col = mix(col, vec3(0.62, 0.50, 0.85), fres * 0.55);
  float spec = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 80.0);
  col += uSun * spec * 0.8;
  float grain = noise(vWorld.xz * 0.01 + uTime * 0.6) * 0.5 + noise(vWorld.xz * 0.04 - uTime) * 0.5;
  float foam = smoothstep(0.55, 0.95, vCrest) + smoothstep(4.0, 0.0, vDepth) * smoothstep(0.06, 0.25, vCrest);
  foam = clamp(foam * (0.55 + 0.6 * grain), 0.0, 1.0);
  col = mix(col, vec3(0.90, 0.97, 1.0), foam);
  float dist = length(cameraPosition - vWorld);
  float fogF = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, mix(0.88, 1.0, foam));
}
`;

export interface Water {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  setWave(p: WaveParams): void;
  update(time: number, tide: number): void;
}

export function createWater(hf: Heightfield, fogDensity: number): Water {
  const half = new Uint16Array(hf.heights.length);
  for (let i = 0; i < half.length; i++) half[i] = DataUtils.toHalfFloat(hf.heights[i] ?? 0);
  const tex = new DataTexture(half, hf.width, hf.height, RedFormat, HalfFloatType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;

  const geo = new PlaneGeometry(hf.sizeX, hf.sizeZ, 360, Math.round((360 * hf.sizeZ) / hf.sizeX));
  geo.rotateX(-Math.PI / 2);

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uTide: { value: 0 },
      uAmp: { value: 0 },
      uWidth: { value: 600 },
      uSpeed: { value: 1000 },
      uStart: { value: 0 },
      uInund: { value: 0.5 },
      uRecStart: { value: 0 },
      uRecDur: { value: 1 },
      uExag: { value: EXAGGERATION },
      uOrigin: { value: new Vector2() },
      uDir: { value: new Vector2(1, 0) },
      uSize: { value: new Vector2(hf.sizeX, hf.sizeZ) },
      uHeight: { value: tex },
      uFogColor: { value: THEME.fog.clone() },
      uFogDensity: { value: fogDensity },
      uSunDir: { value: new Vector3(-0.6, 0.25, -0.75).normalize() },
      uSun: { value: THEME.sun.clone() },
    },
  });
  const mesh = new Mesh(geo, material);
  mesh.name = "water";
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  const u = material.uniforms;
  const set = (name: string, value: unknown): void => {
    const uniform = u[name];
    if (uniform !== undefined) uniform.value = value;
  };

  return {
    mesh,
    material,
    setWave(p) {
      set("uAmp", p.amplitude);
      set("uWidth", p.width);
      set("uSpeed", p.speed);
      set("uStart", p.startTime);
      set("uInund", p.inundation);
      set("uRecStart", p.recedeStart);
      set("uRecDur", p.recedeDuration);
      set("uOrigin", new Vector2(p.origin.x, p.origin.z));
      set("uDir", new Vector2(p.dir.x, p.dir.z));
    },
    update(time, tide) {
      set("uTime", time);
      set("uTide", tide);
    },
  };
}
