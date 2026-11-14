import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves the site from /<repo>/.
const base = process.env.BASE_PATH ?? "/kartverket-aes/";

export default defineConfig({
  base,
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: base,
        name: "Ålesund Tsunami",
        short_name: "Tsunami",
        description: "Cinematic 3D tsunami over Ålesund, built on Kartverket elevation and tide data. Works offline.",
        lang: "en",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#080b24",
        theme_color: "#080b24",
        categories: ["education", "entertainment"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        // Precache everything, including the Kartverket data, so the app works fully offline.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,json,bin}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },
    }),
  ],
});
