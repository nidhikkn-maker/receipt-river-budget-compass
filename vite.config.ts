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
  // Offline worker: the build emits files under "client/", but the site serves them from "/" — strip the prefix
  // or every precache entry 404s and the worker never installs. Pages open from the saved copy at once and
  // refresh in the background (the HTML is only an app shell; data always comes fresh from Cloud).
  vite: { plugins: [mcpPlugin(), VitePWA({ strategies: "generateSW", filename: "sw.js", registerType: "autoUpdate", injectRegister: null, includeManifestIcons: false, devOptions: { enabled: false }, manifest: { name: "Ledgerline", short_name: "Ledgerline", display: "standalone", start_url: "/dashboard", theme_color: "#17242B", background_color: "#f7f9fc", icons: [{ src: "/app-icon.png", sizes: "192x192", type: "image/png" }, { src: "/app-icon-large.png", sizes: "512x512", type: "image/png" }, { src: "/app-icon-large.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] }, workbox: { importScripts: ["/push-events.js", "/sw-extras.js"], globPatterns: ["**/*.{js,css,ico,woff2}", "app-icon-large.png"], globIgnores: ["**/pdf-*.js", "**/pdf.worker*", "**/es-*.js", "**/jspdf*.js", "**/xlsx-*.js", "**/html2canvas*.js", "**/purify*.js", "**/index.es-*.js"], modifyURLPrefix: { "client/": "" }, cleanupOutdatedCaches: true, maximumFileSizeToCacheInBytes: 6000000, navigateFallback: null, runtimeCaching: [{ urlPattern: ({url}) => url.origin === self.location.origin && url.pathname.startsWith("/assets/"), handler: "CacheFirst", options: { cacheName: "ledgerline-lazy", expiration: { maxEntries: 60 } } }, { urlPattern: ({request,url}) => request.mode === "navigate" && !url.pathname.startsWith("/~oauth") && !url.pathname.startsWith("/_serverFn") && !url.pathname.startsWith("/api") && !url.pathname.startsWith("/.lovable") && !url.pathname.startsWith("/lovable") && !url.pathname.startsWith("/u/"), handler: "StaleWhileRevalidate", options: { cacheName: "ledgerline-pages", expiration: { maxEntries: 30 }, cacheableResponse: { statuses: [200] } } }] } })] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
