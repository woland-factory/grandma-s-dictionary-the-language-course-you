import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Emulates a browser restart: record and save in a persistent profile, close
// the browser fully, reopen the SAME profile, and confirm the entry and its
// audio are still there. This proves durability beyond a single-page reload.

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

const fakeMediaArgs = [
  "--no-sandbox",
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
];

test("entries and audio survive a browser restart (same profile)", async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), "grandma-e2e-"));

  let ctx: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    args: fakeMediaArgs,
    viewport: { width: 390, height: 844 },
    permissions: ["microphone"],
  });
  try {
    let page = await ctx.newPage();
    await page.goto(`${baseURL}/`);
    await page.getByTestId("home-record").click();
    const recordBtn = page.getByTestId("record-button");
    await recordBtn.click();
    await page.waitForTimeout(700);
    await recordBtn.click();
    await expect(page.getByTestId("play-button")).toBeVisible();
    await page.getByLabel(/what it means/i).fill("kalimera");
    await page.getByTestId("save-entry").click();
    await expect(
      page.getByRole("heading", { name: "kalimera" }),
    ).toBeVisible();

    // Full browser close.
    await ctx.close();

    // Reopen the same profile.
    ctx = await chromium.launchPersistentContext(userDataDir, {
      args: fakeMediaArgs,
      viewport: { width: 390, height: 844 },
      permissions: ["microphone"],
    });
    page = await ctx.newPage();
    await page.goto(`${baseURL}/dictionary`);
    await expect(page.getByText("kalimera")).toBeVisible();

    const play = page.getByTestId("entry-play").first();
    await play.click();
    await expect(play).toHaveAttribute("aria-label", /pause/i);
  } finally {
    await ctx.close();
  }
});
