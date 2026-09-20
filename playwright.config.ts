import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

// Recording-dependent specs need Chromium's fake microphone
// (--use-fake-device-for-media-stream is Chromium-only). WebKit runs only the
// mic-free specs (webkit, a11y): playback of seeded audio, export, import,
// layout, and keyboard. See e2e/webkit.spec.ts for the honest capability split.
const MIC_FREE = /(webkit|a11y)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1, // sanctioned shared-host allowance
  timeout: 60_000, // per-test floor
  expect: { timeout: 15_000 }, // web-first assertion floor
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    // PRODUCTION build served by vite preview, never a dev server.
    command: `npm run build && npm run preview -- --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // build + warm-up headroom
    env: { NODE_ENV: "production" },
  },
  projects: [
    {
      // Chromium at 390px with a fake mic: runs every spec, including the
      // recording flows (capture, interview, practice, heirloom, persistence).
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        launchOptions: {
          args: [
            "--no-sandbox",
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
        permissions: ["microphone"],
      },
    },
    {
      // WebKit (Safari's engine) at a 390px viewport. Runs only the mic-free
      // specs; recording is verified on Chromium above.
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
      testMatch: MIC_FREE,
    },
  ],
});
