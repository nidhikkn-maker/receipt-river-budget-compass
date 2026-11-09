import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Several suites run in parallel on shared machines; 5 s per test made correct UI tests fail intermittently.
    testTimeout: 15_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
