// Renders public/icons/icon.svg to the PNG sizes needed by the PWA manifest and iOS.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(file, size, { padding = 0, background = "transparent", square = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - padding * 2;
  await page.setContent(
    `<html><body style="margin:0;background:${background};display:grid;place-items:center;height:${size}px">` +
      `<img src="${dataUrl}" style="width:${inner}px;height:${inner}px;${square ? "" : ""}"></body></html>`,
  );
  const png = await page.screenshot({ omitBackground: background === "transparent" });
  await writeFile(new URL(`../public/icons/${file}`, import.meta.url), png);
}

await render("icon-192.png", 192);
await render("icon-512.png", 512);
// Maskable: full-bleed background, artwork within the 80% safe zone.
await render("maskable-512.png", 512, { padding: 52, background: "#080b24" });
// iOS applies its own rounding; give it an opaque square.
await render("apple-touch-icon.png", 180, { background: "#080b24" });
await render("favicon-32.png", 32);
await browser.close();
console.log("Icons written.");
