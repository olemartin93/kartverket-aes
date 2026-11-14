import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { DEFAULT_SCENARIO, SCENARIOS, findScenario, type Scenario } from "./data/scenarios";
import type { DataIndex, TerrainMeta, TideData } from "./data/types";
import { decodeTerrain } from "./lib/heightfield";
import { nextExtremes, tideAt } from "./lib/tide";
import type { FrameState, World } from "./scene/world";
import { formatClock, formatLevel, parseStartTime, pickScenarioId, statusText } from "./ui/format";
import { ICONS } from "./ui/icons";

declare global {
  interface Window {
    /** Exposed for automated tests. */
    __aes?: { ready: boolean; scenario?: string; state?: FrameState; error?: string };
  }
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} missing`);
  return node as T;
}

const base = import.meta.env.BASE_URL;
const STORAGE_KEY = "aes:scenario";
window.__aes = { ready: false };

async function fetchOk(path: string): Promise<Response> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return res;
}

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage may be unavailable (private mode); the URL still carries the choice.
  }
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
  const items = [meta.source, ...(tide ? [tide.source] : [])];
  el<HTMLUListElement>("sources").replaceChildren(
    ...items.map((s) => {
      const li = document.createElement("li");
      li.className = "rounded-2xl bg-white/5 p-3 ring-1 ring-white/10";
      const title = document.createElement("p");
      title.className = "font-medium";
      title.textContent = s.dataset;
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

function renderTide(scenario: Scenario, tide: TideData | undefined): number {
  const chip = el("tide");
  chip.dataset["scenario"] = scenario.id;
  if (tide === undefined) {
    chip.textContent = "No tide forecast";
    chip.title = "Kartverket has no tide prediction for this location; sea level 0 m (NN2000) is used.";
    chip.hidden = false;
    return 0;
  }
  const now = new Date();
  const reading = tideAt(tide, now);
  const ext = nextExtremes(tide, now);
  const next = ext.high !== undefined ? ` · HW ${formatClock(ext.high)}` : "";
  chip.textContent = reading.inRange ? `Tide ${formatLevel(reading.metres)}${next}` : `Tide forecast expired · ${formatLevel(reading.metres)}`;
  const station = `${tide.station.name}${tide.station.code ? `, ${tide.station.code}` : ""}`;
  chip.title = `Kartverket prediction for ${scenario.city.name} (reference station ${station}), relative to NN2000`;
  chip.hidden = false;
  return reading.metres;
}

async function boot(): Promise<void> {
  const offline = el("offline");
  const syncOnline = (): void => {
    offline.hidden = navigator.onLine;
  };
  window.addEventListener("online", syncOnline);
  window.addEventListener("offline", syncOnline);
  syncOnline();

  if (import.meta.env.PROD && "serviceWorker" in navigator) registerSW({ immediate: true });
  if (!hasWebGL2()) {
    showError("Your browser does not support WebGL 2, which this animation needs.");
    return;
  }

  const index = (await (await fetchOk("data/index.json")).json()) as DataIndex;
  const available = SCENARIOS.filter((s) => index.scenarios.some((e) => e.id === s.id));
  if (available.length === 0) throw new Error("No scenarios were built.");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { createWorld } = await import("./scene/world");

  const play = el<HTMLButtonElement>("play");
  const free = el<HTMLButtonElement>("free");
  const amp = el<HTMLInputElement>("amp");
  const ampOut = el<HTMLOutputElement>("ampOut");
  const about = el<HTMLDialogElement>("about");
  const places = el<HTMLDialogElement>("places");
  const progress = el("progress");
  const status = el("status");
  el("restart").innerHTML = ICONS.restart;
  free.innerHTML = ICONS.camera;
  el("info").innerHTML = ICONS.info;
  el("closeAbout").innerHTML = ICONS.close;
  el("closePlaces").innerHTML = ICONS.close;

  let world: World | undefined;
  let current: Scenario | undefined;
  let playing = !reducedMotion;
  let lastStatus = "";
  let loadSeq = 0;

  const syncPlay = (): void => {
    play.innerHTML = playing ? ICONS.pause : ICONS.play;
    play.setAttribute("aria-label", playing ? "Pause" : "Play");
  };

  const onFrame = (s: FrameState): void => {
    progress.style.width = `${(s.time / s.duration) * 100}%`;
    const text = statusText(current?.city.name ?? "", s.toArrival, s.lit, s.totalLights, s.time);
    if (text !== lastStatus) {
      status.textContent = text;
      lastStatus = text;
    }
    if (window.__aes) window.__aes.state = s;
  };

  const renderPlaceList = (): void => {
    el<HTMLUListElement>("placeList").replaceChildren(
      ...available.map((s) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset["scenario"] = s.id;
        btn.className =
          "w-full rounded-2xl bg-white/5 p-3 text-left ring-1 ring-white/10 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-ember aria-[current=true]:bg-ember/15 aria-[current=true]:ring-ember/50";
        if (s.id === current?.id) btn.setAttribute("aria-current", "true");
        const head = document.createElement("span");
        head.className = "flex items-baseline justify-between gap-2";
        const name = document.createElement("span");
        name.className = "font-semibold";
        name.textContent = s.name;
        const region = document.createElement("span");
        region.className = "text-xs text-slate-400";
        region.textContent = s.region;
        head.append(name, region);
        const blurb = document.createElement("span");
        blurb.className = "mt-1 block text-sm text-slate-300";
        blurb.textContent = s.blurb;
        btn.append(head, blurb);
        if (s.realHazard) {
          const badge = document.createElement("span");
          badge.className = "mt-2 inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200 ring-1 ring-amber-400/30";
          badge.textContent = "Based on a real, monitored hazard";
          btn.append(badge);
        }
        btn.addEventListener("click", () => {
          places.close();
          if (s.id !== current?.id) {
            load(s.id, 0).catch((e: unknown) => showError(e instanceof Error ? e.message : String(e)));
          }
        });
        li.append(btn);
        return li;
      }),
    );
  };

  const load = async (id: string, initialTime: number): Promise<void> => {
    const seq = ++loadSeq;
    const scenario = findScenario(id);
    window.__aes = { ready: false, scenario: scenario.id };
    el("loadingText").textContent = `Loading Kartverket data for ${scenario.name}…`;
    el("loading").classList.remove("hidden");

    const hasTide = index.scenarios.find((e) => e.id === scenario.id)?.tide === true;
    const [meta, buffer, tide] = await Promise.all([
      fetchOk(`data/${scenario.id}/terrain.json`).then((r) => r.json() as Promise<TerrainMeta>),
      fetchOk(`data/${scenario.id}/terrain.bin`).then((r) => r.arrayBuffer()),
      hasTide
        ? fetchOk(`data/${scenario.id}/tide.json`)
            .then((r) => r.json() as Promise<TideData>)
            .catch(() => undefined)
        : Promise.resolve(undefined),
    ]);
    if (seq !== loadSeq) return;

    world?.dispose();
    // A fresh canvas guarantees a clean WebGL context for the new scene.
    const oldCanvas = el<HTMLCanvasElement>("scene");
    const canvas = oldCanvas.cloneNode(false) as HTMLCanvasElement;
    oldCanvas.replaceWith(canvas);

    current = scenario;
    remember(scenario.id);
    const url = new URL(window.location.href);
    url.searchParams.set("s", scenario.id);
    url.searchParams.delete("t");
    history.replaceState(null, "", url);

    const hf = decodeTerrain(meta, buffer);
    el("placeName").textContent = `${scenario.name} · Tsunami`;
    el("placeRegion").textContent = scenario.region;
    document.title = `${scenario.name} · Tsunami`;
    el("synthetic").hidden = !meta.synthetic;
    el("scenarioNote").textContent = scenario.note;
    el("exagNote").textContent =
      scenario.exaggeration === 1 ? "Relief is shown at true scale." : `Relief is exaggerated ×${scenario.exaggeration}.`;
    renderSources(meta, tide);
    const tideLevel = renderTide(scenario, tide);

    amp.value = String(scenario.wave.amplitude);
    ampOut.textContent = `${scenario.wave.amplitude} m`;
    free.setAttribute("aria-pressed", "false");
    lastStatus = "";

    world = createWorld({
      canvas,
      scenario,
      hf,
      meta,
      tide: tideLevel,
      amplitude: scenario.wave.amplitude,
      reducedMotion,
      initialTime,
      startPaused: !playing,
      onFrame,
    });
    renderPlaceList();
    el("loading").classList.add("hidden");
    window.__aes = { ...window.__aes, ready: true, scenario: scenario.id };
  };

  syncPlay();
  play.addEventListener("click", () => {
    playing = !playing;
    if (playing) world?.play();
    else world?.pause();
    syncPlay();
  });
  el("restart").addEventListener("click", () => {
    world?.restart();
    playing = true;
    syncPlay();
  });
  amp.addEventListener("input", () => {
    const v = Number(amp.value);
    ampOut.textContent = `${v} m`;
    world?.setAmplitude(v);
  });
  free.addEventListener("click", () => {
    const on = free.getAttribute("aria-pressed") !== "true";
    free.setAttribute("aria-pressed", String(on));
    world?.setFreeCamera(on);
  });
  el("info").addEventListener("click", () => about.showModal());
  el("closeAbout").addEventListener("click", () => about.close());
  el("placeBtn").addEventListener("click", () => places.showModal());
  el("closePlaces").addEventListener("click", () => places.close());
  for (const d of [about, places]) {
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
    });
  }

  const ids = available.map((s) => s.id);
  const first = pickScenarioId(window.location.search, remembered(), ids, DEFAULT_SCENARIO);
  await load(first, parseStartTime(window.location.search, 60));
}

boot().catch((e: unknown) => {
  console.error(e);
  showError(e instanceof Error ? e.message : String(e));
});
