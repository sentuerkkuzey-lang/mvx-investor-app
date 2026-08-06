import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest statt der Standard-generateSW-Strategie, weil wir
      // einen eigenen Service Worker (src/sw.ts) mit push/notificationclick
      // Handlern brauchen, nicht nur reines Caching.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["mvx-logo.png"],
      manifest: {
        name: "MVX Investor Portal",
        short_name: "MVX Vote",
        description: "Investoren-Abstimmungsportal von MVX",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/mvx-logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
