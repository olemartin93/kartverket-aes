import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const config = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");

describe("PWA shell", () => {
  it("has the meta tags needed for an installable, home-screen app", () => {
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
    expect(html).toMatch(/name="theme-color"/);
    expect(html).toMatch(/rel="apple-touch-icon"/);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
  });

  it("precaches Kartverket data files for offline use", () => {
    expect(config).toMatch(/globPatterns:.*json.*bin/);
  });

  it("ships icons in the sizes browsers require, including a maskable one", () => {
    for (const f of ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png", "icon.svg"]) {
      expect(() => readFileSync(new URL(`../../public/icons/${f}`, import.meta.url))).not.toThrow();
      expect(config).toContain(f === "apple-touch-icon.png" ? "apple-touch-icon.png" : f);
    }
    expect(config).toMatch(/purpose: "maskable"/);
  });

  it("checks PNG dimensions of the manifest icons", () => {
    const size = (f: string): [number, number] => {
      const b = readFileSync(new URL(`../../public/icons/${f}`, import.meta.url));
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    expect(size("icon-192.png")).toEqual([192, 192]);
    expect(size("icon-512.png")).toEqual([512, 512]);
    expect(size("maskable-512.png")).toEqual([512, 512]);
    expect(size("apple-touch-icon.png")).toEqual([180, 180]);
  });
});
