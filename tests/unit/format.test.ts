import { describe, expect, it } from "vitest";
import { formatLevel, parseStartTime, pickScenarioId, statusText } from "../../src/ui/format";

describe("UI formatting", () => {
  it("parses the ?t= start time and clamps it", () => {
    expect(parseStartTime("", 38)).toBe(0);
    expect(parseStartTime("?t=12.5", 38)).toBe(12.5);
    expect(parseStartTime("?t=-4", 38)).toBe(0);
    expect(parseStartTime("?t=999", 38)).toBe(38);
    expect(parseStartTime("?t=abc", 38)).toBe(0);
  });

  it("formats water levels with a sign", () => {
    expect(formatLevel(0.434)).toBe("+0.43 m");
    expect(formatLevel(-1.2)).toBe("−1.20 m");
    expect(formatLevel(0)).toBe("±0.00 m");
  });

  it("describes the phases of the animation", () => {
    expect(statusText("Bergen", 10, 100, 100, 2)).toBe("Flying in towards Bergen");
    expect(statusText("Ålesund", 4.25, 100, 100, 12)).toBe("Wave reaches Ålesund in 4.3 s");
    expect(statusText("Ålesund", -3, 25, 100, 26)).toBe("Ålesund flooded · 75% of lights out");
  });

  it("picks the scenario from the URL, then memory, then the default", () => {
    const ids = ["alesund", "oslo", "geiranger"];
    expect(pickScenarioId("?s=oslo", "geiranger", ids, "alesund")).toBe("oslo");
    expect(pickScenarioId("", "geiranger", ids, "alesund")).toBe("geiranger");
    expect(pickScenarioId("?s=atlantis", null, ids, "alesund")).toBe("alesund");
    expect(pickScenarioId("", "gone", ["oslo"], "alesund")).toBe("oslo");
  });
});
