import { BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { THEME } from "./theme";

export function createSky(radius: number, sunDir: Vector3): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: THEME.skyZenith.clone() },
      uMid: { value: THEME.skyMid.clone() },
      uHorizon: { value: THEME.skyHorizon.clone() },
      uFog: { value: THEME.fog.clone() },
      uSunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uMid, uHorizon, uFog, uSunDir;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float h = vDir.y;
        float sunAmt = pow(max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 3.0);
        vec3 horizon = mix(uFog, uHorizon, sunAmt);
        vec3 col = h < 0.0 ? uFog : mix(horizon, uMid, smoothstep(0.0, 0.18, h));
        col = mix(col, uZenith, smoothstep(0.15, 0.7, h));
        // A sprinkling of stars high up.
        vec3 cell = floor(vDir * 420.0);
        float star = step(0.9975, hash(cell)) * smoothstep(0.25, 0.6, h);
        col += vec3(star * 0.8);
        // Faint aurora band.
        float band = exp(-pow((h - 0.38 - 0.06 * sin(vDir.x * 6.0 + vDir.z * 4.0)) * 9.0, 2.0));
        col += vec3(0.10, 0.55, 0.45) * band * 0.25 * (1.0 - sunAmt);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(radius, 48, 24), mat);
  mesh.name = "sky";
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
