import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from "three";
import type { Heightfield } from "../lib/heightfield";
import { EXAGGERATION, THEME, terrainColor } from "./theme";

export function createTerrain(hf: Heightfield): Mesh {
  const { width: w, height: h, sizeX, sizeZ } = hf;
  const positions = new Float32Array(w * h * 3);
  const colors = new Float32Array(w * h * 3);
  const c = new Color();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const elev = hf.heights[k] ?? 0;
      positions[k * 3] = ((i + 0.5) / w - 0.5) * sizeX;
      positions[k * 3 + 1] = elev * EXAGGERATION;
      positions[k * 3 + 2] = ((j + 0.5) / h - 0.5) * sizeZ;
      if (hf.land[k] === 1) terrainColor(elev, c);
      else c.copy(THEME.seabed).multiplyScalar(1 + elev / 80);
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }
  const index = new Uint32Array((w - 1) * (h - 1) * 6);
  let n = 0;
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i;
      const b = a + 1;
      const d = a + w;
      const e = d + 1;
      index.set([a, d, b, b, d, e], n);
      n += 6;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  geo.setIndex(new BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false });
  const mesh = new Mesh(geo, mat);
  mesh.name = "terrain";
  return mesh;
}
