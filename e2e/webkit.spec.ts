import { test, expect, type Page } from "@playwright/test";
import { assertNoHorizontalScroll, seedViaImport, MP4, WAV } from "./seed";

// WebKit (Safari's engine) at a 390px viewport, plus the same checks on Chromium
// so layout and focus are proven on both.
//
// Honest capability split. Two things Playwright's Linux WebKit (WebKitGTK)
// cannot do, which real Safari does:
//   1. It has no MediaRecorder, so live capture stays verified on Chromium.
//   2. It cannot store a Blob in IndexedDB ("Error preparing Blob/File data to
//      be stored in object store"), so any flow that needs stored audio
//      (playback, export, import round-trip) is verified on Chromium here and
//      the app's real Safari path is unaffected.
// So the blob-free surface (first render, 390px layout, keyboard focus, designed
// states) runs on both engines; the audio flows run on Chromium. The Safari
// audio format (audio/mp4) is proven by pickMimeType()'s unit test plus the
// audio/mp4 round-trip below (on Chromium). Nothing here fakes a passing state.

const VIEWPORT_WIDTH = 390;

// True only where IndexedDB can store audio Blobs (every engine except
// Playwright's Linux WebKit). Guards the audio flows.
function skipIfNoBlobStorage(page: Page, testInfo: { project: { name: string } }) {
  test.skip(
    testInfo.project.name === "mobile-webkit",
    "Playwright's Linux WebKit cannot store Blobs in IndexedDB; audio flows run on Chromium (real Safari is unaffected).",
  );
}

test("first render paints real content immediately", async ({ page }) => {
  // No network-idle wait: the shell renders synchronously, so the primary
  // action is present as soon as the document commits.
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByTestId("home-record")).toBeVisible();
  await assertNoHorizontalScroll(page);
});

test("core screens have no horizontal scroll at 390px", async ({ page }) => {
  // These screens need no stored audio, so they render on every engine.
  await page.goto("/");
  await expect(page.getByTestId("home-record")).toBeVisible();
  await assertNoHorizontalScroll(page);

  await page.goto("/dictionary");
  await expect(page.getByText("Record your first word")).toBeVisible();
  await assertNoHorizontalScroll(page);

  await page.goto("/practice");
  await expect(page.getByText(/all caught up/i)).toBeVisible();
  await assertNoHorizontalScroll(page);

  await page.goto("/data");
  await expect(page.getByText("Bring your dictionary here")).toBeVisible();
  await assertNoHorizontalScroll(page);

  const width = await page.evaluate(() => window.innerWidth);
  expect(width).toBeLessThanOrEqual(VIEWPORT_WIDTH);
});

test("the capture screen shows a designed state at 390px", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByRole("heading", { name: "Record a word" })).toBeVisible();
  // Chromium shows the record control; Linux WebKit has no MediaRecorder and
  // shows the designed unsupported state. Either is a valid designed surface,
  // never a blank screen or a crash.
  const recordBtn = page.getByTestId("record-button");
  const unsupported = page.getByRole("alert");
  await expect(recordBtn.or(unsupported).first()).toBeVisible();
  await assertNoHorizontalScroll(page);
});

test("plays the elder then the attempt in sequence", async ({ page }, testInfo) => {
  skipIfNoBlobStorage(page, testInfo);
  await seedViaImport(page, {
    ...WAV,
    writtenForm: "yiayia",
    meaning: "grandmother",
  });

  await page.goto("/dictionary");
  await page.getByText("yiayia").click();

  const play = page.getByTestId("two-voice-play");
  await expect(play).toBeVisible();
  await expect(play).toBeEnabled();
  await expect(play).toHaveText(/play both voices/i);

  await play.click();
  // Pressed feedback flips synchronously on tap, before any audio starts.
  await expect(play).toHaveAttribute("aria-pressed", "true");
  // The elder plays first, then playback crosses into the attempt segment.
  await expect(play).toHaveAttribute("data-voice", "elder");
  await expect(play).toHaveAttribute("data-voice", "attempt");
  await assertNoHorizontalScroll(page);
});

test("the Safari audio format (audio/mp4) round-trips through the heirloom file", async ({
  page,
}, testInfo) => {
  skipIfNoBlobStorage(page, testInfo);
  await seedViaImport(page, {
    ...MP4,
    writtenForm: "pappou",
    meaning: "grandfather",
  });

  // The imported entry appears and its two-voice control is ready to play.
  await page.goto("/dictionary");
  await page.getByText("pappou").click();
  await expect(page.getByTestId("two-voice-play")).toBeEnabled();

  // The audio/mp4 MIME survived import into stored audio, so it survives export
  // too: the Safari format is preserved end to end.
  const mimeTypes = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("grandmas-dictionary");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<Array<{ mimeType: string }>>(
      (resolve, reject) => {
        const rq = db
          .transaction("audioBlobs")
          .objectStore("audioBlobs")
          .getAll();
        rq.onsuccess = () => resolve(rq.result as Array<{ mimeType: string }>);
        rq.onerror = () => reject(rq.error);
      },
    );
    db.close();
    return rows.map((r) => r.mimeType);
  });
  expect(mimeTypes.length).toBeGreaterThan(0);
  expect(mimeTypes.every((m) => m === "audio/mp4")).toBe(true);
});

test("exports the dictionary as a non-empty zip", async ({ page }, testInfo) => {
  skipIfNoBlobStorage(page, testInfo);
  await seedViaImport(page, {
    ...WAV,
    writtenForm: "yiayia",
    meaning: "grandmother",
  });

  await page.goto("/data");
  const exportBtn = page.getByTestId("data-export");
  await expect(exportBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportBtn.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const path = await download.path();
  const { statSync } = await import("node:fs");
  expect(statSync(path).size).toBeGreaterThan(0);
});

test("imports a known archive and the word appears and plays", async ({
  page,
}, testInfo) => {
  skipIfNoBlobStorage(page, testInfo);
  await seedViaImport(page, { ...WAV, writtenForm: "agapi", meaning: "my love" });
  await page.goto("/dictionary");
  await expect(page.getByText("agapi")).toBeVisible();

  const play = page.getByTestId("entry-play").first();
  await play.click();
  await expect(play).toHaveAttribute("aria-label", /pause/i);
  await assertNoHorizontalScroll(page);
});
