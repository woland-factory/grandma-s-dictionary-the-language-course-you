import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA build. Output lands in dist/ and is served by nginx in the
// container. config.js is injected at container start and loaded before the
// bundle, so it is not bundled here.
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    sourcemap: false,
  },
});
