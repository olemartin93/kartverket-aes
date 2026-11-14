import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial } from "three";

/** A floating text label rendered to a canvas texture. */
export function createLabel(text: string, worldHeight: number): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.font = "700 150px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,138,92,0.9)";
    ctx.shadowBlur = 36;
    ctx.fillStyle = "#fff4e8";
    ctx.fillText(text, 512, 128);
  }
  const tex = new CanvasTexture(canvas);
  tex.minFilter = LinearFilter;
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
  sprite.scale.set(worldHeight * 4, worldHeight, 1);
  sprite.name = `label-${text}`;
  return sprite;
}
