/** Reads `?t=<seconds>` so a link can jump straight to a moment in the animation. */
export function parseStartTime(search: string, duration: number): number {
  const raw = new URLSearchParams(search).get("t");
  if (raw === null || raw.trim() === "") return 0;
  const t = Number(raw);
  return Number.isFinite(t) ? Math.min(Math.max(t, 0), duration) : 0;
}

export function formatLevel(m: number): string {
  const sign = m > 0 ? "+" : m < 0 ? "−" : "±";
  return `${sign}${Math.abs(m).toFixed(2)} m`;
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

export function statusText(city: string, toArrival: number, lit: number, total: number, time: number): string {
  if (time < 6) return `Flying in towards ${city}`;
  if (toArrival > 0.2) return `Wave reaches ${city} in ${toArrival.toFixed(1)} s`;
  const out = total === 0 ? 0 : Math.round((1 - lit / total) * 100);
  return `${city} flooded · ${out}% of lights out`;
}

/** Scenario id from `?s=`, falling back to a remembered choice, then the default. */
export function pickScenarioId(search: string, remembered: string | null, available: readonly string[], fallback: string): string {
  const fromUrl = new URLSearchParams(search).get("s");
  for (const id of [fromUrl, remembered]) if (id !== null && available.includes(id)) return id;
  return available.includes(fallback) ? fallback : (available[0] ?? fallback);
}
