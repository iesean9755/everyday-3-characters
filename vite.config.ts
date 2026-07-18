import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const AUDIO_CACHE_VERSION = "20260718c";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const isGitHubPages = env.VITE_DEPLOY_TARGET === "github-pages";
  const base = isGitHubPages ? "/everyday-3-characters/" : "/";

  return {
    base,
    plugins: [
      react(),
      VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/icon.svg",
        "icons/icon-192.webp",
        "icons/icon-512.webp",
      ],
      manifest: {
        name: "每天认3个字",
        short_name: "认3个字",
        description: "生活汉字学习",
        theme_color: "#315c4c",
        background_color: "#f6f1e7",
        display: "standalone",
        orientation: "portrait-primary",
        lang: "zh-CN",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "icons/icon-192.webp",
            sizes: "192x192",
            type: "image/webp",
            purpose: "any maskable",
          },
          {
            src: "icons/icon-512.webp",
            sizes: "512x512",
            type: "image/webp",
            purpose: "any maskable",
          },
          {
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,webp,json}"],
        runtimeCaching: [
          {
            urlPattern: /\.mp3(?:\?.*)?$/i,
            handler: "CacheFirst",
            options: {
              cacheName: `audio-runtime-${AUDIO_CACHE_VERSION}`,
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 700,
                maxAgeSeconds: 60 * 60 * 24 * 180,
              },
            },
          },
        ],
      },
      }),
    ],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
  };
});
