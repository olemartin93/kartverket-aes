import "./style.css";
import { registerSW } from "virtual:pwa-register";
import type { TerrainMeta, TideData } from "./data/types";
import { decodeTerrain } from "./lib/heightfield";
import { nextExtremes, tideAt } from "./lib/tide";
import type { FrameState, World } from "./scene/world";
import { formatClock, formatLevel, statusText } from "./ui/format";
import { ICONS } from "./ui/icons";

declare global {
  interface Window {
    /** Exposed for automated tests. */
    __aes?: { ready: boolean; state?: FrameState; error?: string };
  }
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} missing`);
  return node as T;
}

const base = import.meta.env.BASE_URL;
window.__aes = { ready: false };

async function fetchOk(path: string): Promise<Response> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return res;
}

function showError(message: string): void {
  window.__aes = { ready: false, error: message };
  el("loadingText").textContent = message;
  el("loading").classList.remove("hidden");
}

function hasWebGL2(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

function renderSources(meta: TerrainMeta, tide: TideData | undefined): void {
  const list = el<HTMLUListElement>("sources");
  const items = [meta.source, ...(tide ? [tide.source] : [])];
  list.replaceChildren(
    ...items.map((s) => {
      const li = document.createElement("li");
      li.className = "rounded-2xl bg-white/5 p-3 ring-1 ring-white/10";
      const title = document.createElement("p");
      title.className = "font-medium";
      title.textContent = `${s.dataset}`;
      const detail = document.createElement("p");
      detail.className = "text-xs text-slate-400";
      detail.textContent = `${s.attribution} · ${s.license} · downloaded ${new Date(s.fetchedAt).toLocaleDateString("nb-NO")}`;
      const link = document.createElement("a");
      link.className = "break-all text-xs text-lagoon underline";
      link.href = s.url;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      link.textContent = new URL(s.url).host;
      li.append(title, detail, link);
      return li;
    }),
  );
}

function setupUi(world: World, reducedMotion: boolean): (s: FrameState) => void {
  const play = el<HTMLButtonElement>("play");
  const free = el<HTMLButtonElement>("free");
  const amp = el<HTMLInputElement>("amp");
  const ampOut = el<HTMLOutputElement>("ampOut");
  const about = el<HTMLDialogElement>("about");
  const progress = el("progress");
  const status = el("status");
  el("restart").innerHTML = ICONS.restart;
  free.innerHTML = ICONS.camera;
  el("info").innerHTML = ICONS.info;
  el("closeAbout").innerHTML = ICONS.close;

  let playing = !reducedMotion;
  if (!playing) world.pause();
  const syncPlay = (): void => {
    play.innerHTML = playing ? ICONS.pause : ICONS.play;
    play.setAttribute("aria-label", playing ? "Pause" : "Play");
  };
  syncPlay();
  play.addEventListener("click", () => {
    playing = !playing;
    if (playing) world.play();
    else world.pause();
    syncPlay();
  });
  el("restart").addEventListener("click", () => {
    world.restart();
    playing = true;
    syncPlay();
  });
  amp.addEventListener("input", () => {
    const v = Number(amp.value);
    ampOut.textContent = `${v} m`;
    world.setAmplitude(v);
  });
  free.addEventListener("click", () => {
    const on = free.getAttribute("aria-pressed") !== "true";
    free.setAttribute("aria-pressed", String(on));
    world.setFreeCamera(on);
  });
  el("info").addEventListener("click", () => about.showModal());
  el("closeAbout").addEventListener("click", () => about.close());
  about.addEventListener("click", (e) => {
    if (e.target === about) about.close();
  });

  let lastStatus = "";
  return (s) => {
    progress.style.width = `${(s.time / s.duration) * 100}%`;
    const text = statusText(s.toArrival, s.lit, s.totalLights, s.time);
    if (text !== lastStatus) {
      status.textContent = text;
      lastStatus = text;
    }
    if (window.__aes) window.__aes.state = s;
  };
}

function setupOnlineBadge(): void {
  const badge = el("offline");
  const sync = (): void => {
    badge.hidden = navigator.onLine;
  };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  sync();
}

async function start(): Promise<void> {
  setupOnlineBadge();
  if (import.meta.env.PROD && "serviceWorker" in navigator) registerSW({ immediate: true });
  if (!hasWebGL2()) {
    showError("Your browser does not support WebGL 2, which this animation needs.");
    return;
  }

  const [meta, buffer, tide] = await Promise.all([
    fetchOk("data/terrain.json").then((r) => r.json() as Promise<TerrainMeta>),
    fetchOk("data/terrain.bin").then((r) => r.arrayBuffer()),
    fetchOk("data/tide.json")
      .then((r) => r.json() as Promise<TideData>)
      .catch(() => undefined),
  ]);

  const hf = decodeTerrain(meta, buffer);
  el("synthetic").hidden = !meta.synthetic;
  renderSources(meta, tide);

  let tideLevel = 0;
  if (tide !== undefined) {
    const now = new Date();
    const reading = tideAt(tide, now);
    tideLevel = reading.metres;
    const chip = el("tide");
    const ext = nextExtremes(tide, now);
    const next = ext.high !== undefined ? ` · HW ${formatClock(ext.high)}` : "";
    chip.textContent = reading.inRange
      ? `Tide ${formatLevel(reading.metres)}${next}`
      : `Tide forecast expired · using ${formatLevel(reading.metres)}`;
    chip.title = `Kartverket prediction for ${tide.station.name} (${tide.station.code}), relative to NN2000`;
    chip.hidden = false;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { createWorld } = await import("./scene/world");
  let onFrame: (s: FrameState) => void = () => undefined;
  const world = createWorld({
    canvas: el<HTMLCanvasElement>("scene"),
    hf,
    meta,
    tide: tideLevel,
    reducedMotion,
    onFrame: (s) => onFrame(s),
  });
  onFrame = setupUi(world, reducedMotion);
  el("loading").classList.add("hidden");
  window.__aes = { ...window.__aes, ready: true };
}

start().catch((e: unknown) => {
  console.error(e);
  showError(e instanceof Error ? e.message : String(e));
});
