/**
 * Verifies the files in public/data before a build is published:
 * every scenario present, correct structure, plausible values and a trusted
 * Kartverket origin.
 *
 *   npm run check-data            (fixtures allowed)
 *   npm run check-data -- --real  (fails on synthetic data; used by deploy)
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { SCENARIOS } from "../src/data/scenarios";
import type { DataIndex, TerrainMeta, TideData } from "../src/data/types";
import { validateTerrain, validateTide } from "../src/data/validate";

const dir = new URL("../public/data/", import.meta.url);
const requireReal = process.argv.includes("--real");
const errors: string[] = [];
const index = JSON.parse(await readFile(new URL("index.json", dir), "utf8")) as DataIndex;
if (requireReal && index.synthetic) errors.push("index.json is synthetic");

for (const s of SCENARIOS) {
  const entry = index.scenarios.find((e) => e.id === s.id);
  if (entry === undefined) {
    errors.push(`${s.id}: missing from index.json`);
    continue;
  }
  const sdir = new URL(`${s.id}/`, dir);
  const meta = JSON.parse(await readFile(new URL("terrain.json", sdir), "utf8")) as TerrainMeta;
  const bin = await readFile(new URL("terrain.bin", sdir));
  const raw = new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
  const problems = validateTerrain(meta, raw);
  if (meta.scenario !== s.id) problems.push(`terrain.json is for ${meta.scenario}`);
  if (requireReal && meta.synthetic) problems.push("synthetic terrain must never be deployed");
  const tidePath = new URL("tide.json", sdir);
  if (entry.tide !== existsSync(tidePath)) problems.push("index.json tide flag does not match tide.json");
  if (entry.tide) {
    const tide = JSON.parse(await readFile(tidePath, "utf8")) as TideData;
    problems.push(...validateTide(tide));
    if (requireReal && tide.synthetic) problems.push("synthetic tide must never be deployed");
  }
  errors.push(...problems.map((p) => `${s.id}: ${p}`));
  if (problems.length === 0) console.log(`✓ ${s.id} (${meta.width}x${meta.height}${entry.tide ? ", tide" : ", no tide"})`);
}
if (errors.length > 0) {
  console.error(`Data check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Data OK (${index.synthetic ? "synthetic fixtures" : `Kartverket, built ${index.builtAt}`}).`);
