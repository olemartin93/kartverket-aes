import { expect, test, type Page } from "@playwright/test";

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__aes?.ready === true || window.__aes?.error !== undefined, null, { timeout: 30_000 });
  const err = await page.evaluate(() => window.__aes?.error);
  expect(err, "app reported an error").toBeUndefined();
}

async function animTime(page: Page): Promise<number> {
  return page.evaluate(() => window.__aes?.state?.time ?? -1);
}

test.describe("Ålesund tsunami PWA", () => {
  test("loads Kartverket-backed scene and renders WebGL", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("./");
    await expect(page).toHaveTitle("Ålesund Tsunami");
    await waitReady(page);
    await expect(page.locator("#loading")).toBeHidden();
    await page.waitForFunction(() => (window.__aes?.state?.time ?? 0) > 1);

    // The canvas must contain an actual rendered image (not a blank colour).
    const png = await page.locator("#scene").screenshot();
    expect(png.byteLength).toBeGreaterThan(20_000);
    expect(errors).toEqual([]);
  });

  test("animation runs, pauses and restarts", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("./");
    await waitReady(page);
    await page.waitForFunction(() => (window.__aes?.state?.time ?? 0) > 1.5);
    await page.getByRole("button", { name: "Pause" }).click();
    const t1 = await animTime(page);
    await page.waitForTimeout(500);
    const t2 = await animTime(page);
    expect(Math.abs(t2 - t1)).toBeLessThan(0.05);
    await page.getByRole("button", { name: "Restart" }).click();
    await page.waitForFunction((before) => (window.__aes?.state?.time ?? Infinity) < before, t1);
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  });

  test("wave height slider updates the simulation", async ({ page }) => {
    await page.goto("./");
    await waitReady(page);
    await page.locator("#amp").fill("50");
    await expect(page.locator("#ampOut")).toHaveText("50 m");
    await page.waitForFunction(() => window.__aes?.state?.amplitude === 50);
  });

  test("wave reaches the city and floods lights", async ({ page }) => {
    // Jump to just after the crest reaches Ålesund (independent of frame rate).
    await page.goto("./?t=24");
    await waitReady(page);
    await page.waitForFunction(() => {
      const s = window.__aes?.state;
      return s !== undefined && s.toArrival < -2 && s.lit < s.totalLights;
    }, null, { timeout: 30_000, polling: 250 });
    const s = await page.evaluate(() => window.__aes?.state);
    expect(s).toBeDefined();
    expect(s!.lit).toBeLessThan(s!.totalLights);
    await expect(page.locator("#status")).toContainText("flooded");
  });

  test("about sheet lists data sources and the disclaimer", async ({ page }) => {
    await page.goto("./");
    await waitReady(page);
    await page.getByRole("button", { name: "About and data sources" }).click();
    const dialog = page.locator("#about");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("not a hazard or risk model");
    await expect(dialog.locator("#sources li")).toHaveCount(2);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  test("has a valid web app manifest with icons", async ({ page, request }) => {
    await page.goto("./");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const res = await request.get(new URL(href!, page.url()).toString());
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as { display: string; start_url: string; icons: { src: string; sizes: string }[] };
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/kartverket-aes/");
    for (const icon of manifest.icons) {
      const r = await request.get(new URL(icon.src, new URL(href!, page.url())).toString());
      expect(r.ok(), icon.src).toBe(true);
    }
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
  });

  test("works offline after the first visit", async ({ page, context }) => {
    await page.goto("./");
    await waitReady(page);
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.active?.state === "activated";
    }, null, { timeout: 30_000 });
    // Make sure the page is controlled so precached responses are used.
    await page.reload();
    await waitReady(page);

    await context.setOffline(true);
    await page.reload();
    await waitReady(page);
    await expect(page.locator("#offline")).toBeVisible();
    await page.waitForFunction(() => (window.__aes?.state?.time ?? 0) > 0.5);
    await context.setOffline(false);
  });

  test("fits a phone screen without horizontal scrolling", async ({ page }) => {
    await page.goto("./");
    await waitReady(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Pause", "Restart", "Free camera", "About and data sources"]) {
      await expect(page.getByRole("button", { name })).toBeInViewport();
    }
  });
});
