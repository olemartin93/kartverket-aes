# Ålesund Tsunami 🌊

An offline-capable Progressive Web App that flies you along the fjord towards
Ålesund at dusk and then lets a (fictional) tsunami roll in from the open sea
and wash over the city. Built on open data from **Kartverket**.

**Live:** https://olemartin93.github.io/kartverket-aes/

Open it on your phone and choose **Add to Home Screen** (Safari: Share → Add to
Home Screen, Chrome: ⋮ → Install app). After the first visit it works offline.

## Data – trustworthy sources only

| Data | Source | Licence |
| --- | --- | --- |
| Terrain (DTM, NN2000, ~60 m grid) | Kartverket *Nasjonal høydemodell* via Geonorge WCS `wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833` | CC BY 4.0 |
| Tide prediction for Ålesund (NN2000) | Kartverket *Se havnivå* API `vannstand.kartverket.no/tideapi.php` | CC BY 4.0 |

* Data is downloaded **at build time in CI** (`npm run fetch-data`) straight
  from Kartverket over HTTPS, then bundled and precached so the app needs no
  network at runtime.
* `npm run check-data -- --real` refuses to deploy unless the data passes
  validation: trusted host + provider, licence, plausible relief and a
  ground-truth check that **Aksla** rises to ≈189 m.
* Each file records its exact source URL and download time. Both are shown in
  the app's *About* sheet.
* The site rebuilds weekly so the tide forecast stays current.

The wave itself is **illustrative, not a hazard model**: shape, height and
speed are stylised and time-lapsed, the sea floor is synthetic (the DTM has no
bathymetry), the relief is exaggerated ×1.5 and the city lights are placed
randomly on low-lying land.

## Development

```bash
npm ci
npm run fixture      # synthetic test data (flagged, shows a banner, never deployed)
# or: npm run fetch-data   # real data from Kartverket
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Strict TypeScript |
| `npm test` | Unit tests (Vitest): wave model, heightfield, tide, camera, parsers, data validation, PWA config |
| `npm run test:e2e` | Playwright on desktop + phone: rendering, controls, flooding, manifest, **offline reload** |
| `npm run icons` | Re-render PNG icons from `public/icons/icon.svg` |

Stack: Vite, TypeScript (strict), Three.js, Tailwind CSS, vite-plugin-pwa (Workbox).

## Deployment

`.github/workflows/deploy.yml` builds, tests and deploys to GitHub Pages on
every push to `main`. If Pages is not enabled yet, set
**Settings → Pages → Source: GitHub Actions** once.
