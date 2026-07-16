import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
      globPatterns: ["**/*.{js,css,html,svg,png,mp3,json}"],
      },
    }),
  ],
  test: { environment: "jsdom", setupFiles: "./src/test/setup.ts", css: true },
});
