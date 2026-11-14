/**
 * Verifies the files in public/data before a build is published:
 * correct structure, plausible values and a trusted Kartverket origin.
 *
 *   npm run check-data            (fixtures allowed)
 *   npm run check-data -- --real  (fails on synthetic data; used by deploy)
 */
import { readFile } from "node:fs/promises";
import type { TerrainMeta, TideData } from "../src/data/types";
import { validateTerrain, validateTide } from "../src/data/validate";

const dir = new URL("../public/data/", import.meta.url);
const requireReal = process.argv.includes("--real");
const meta = JSON.parse(await readFile(new URL("terrain.json", dir), "utf8")) as TerrainMeta;
const bin = await readFile(new URL("terrain.bin", dir));
const raw = new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
const tide = JSON.parse(await readFile(new URL("tide.json", dir), "utf8")) as TideData;

const errors = [...validateTerrain(meta, raw), ...validateTide(tide)];
if (requireReal && (meta.synthetic || tide.synthetic)) errors.push("synthetic data must never be deployed");
if (errors.length > 0) {
  console.error(`Data check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Data OK (${meta.synthetic ? "synthetic fixture" : `Kartverket, fetched ${meta.source.fetchedAt}`}).`);
