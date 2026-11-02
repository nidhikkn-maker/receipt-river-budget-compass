// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { VitePWA } from "vite-plugin-pwa";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: { plugins: [mcpPlugin(), VitePWA({ strategies: "generateSW", filename: "sw.js", registerType: "autoUpdate", injectRegister: null, devOptions: { enabled: false }, manifest: { name: "Ledgerline", short_name: "Ledgerline", display: "standalone", start_url: "/dashboard", theme_color: "#17242B", background_color: "#f7f9fc", icons: [{ src: "/app-icon.png", sizes: "192x192", type: "image/png" }, { src: "/app-icon-large.png", sizes: "512x512", type: "image/png" }, { src: "/app-icon-large.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] }, workbox: { importScripts: ["/push-events.js"], globPatterns: ["**/*.{js,css,png,ico,woff2}"], maximumFileSizeToCacheInBytes: 6000000, navigateFallback: null, runtimeCaching: [{ urlPattern: ({request,url}) => request.mode === "navigate" && !url.pathname.startsWith("/~oauth") && !url.pathname.startsWith("/_serverFn") && !url.pathname.startsWith("/api"), handler: "NetworkFirst", options: { networkTimeoutSeconds: 3, cacheName: "ledgerline-pages", expiration: { maxEntries: 20 } } }] } })] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
