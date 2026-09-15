import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// The heirloom file end to end: record on one "device" (browser context),
// export the zip, open it in a FRESH context, and prove the words and the
// actual audio bytes made the trip. Chromium runs with fake media flags (see
// playwright.config.ts), so recording works with no mic.

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;
const mobile = { width: 390, height: 844 };

async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflow, "page should not scroll horizontally at 390px").toBe(false);
}

// Record one word via /new and land on its entry detail.
async function createEntry(page: Page, meaning: string) {
  await page.goto(`${baseURL}/new`);
  const recordBtn = page.getByTestId("record-button");
  await recordBtn.click();
  await page.waitForTimeout(600);
  await recordBtn.click();
  await expect(page.getByTestId("play-button")).toBeVisible();
  await page.getByLabel(/what it means/i).fill(meaning);
  await page.getByTestId("save-entry").click();
  await expect(page.getByRole("heading", { name: meaning })).toBeVisible();
}

// Reads the stored rows and returns the elder audio bytes for the entry with
// the given meaning plus the bytes of the (single) attempt.
function readStoredAudio(page: Page, meaning: string) {
  return page.evaluate(async (target) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("grandmas-dictionary");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const getAll = (name: string) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const rq = db.transaction(name).objectStore(name).getAll();
        rq.onsuccess = () => resolve(rq.result as Record<string, unknown>[]);
        rq.onerror = () => reject(rq.error);
      });
    const entries = await getAll("entries");
    const recordings = await getAll("elderRecordings");
    const attempts = await getAll("attempts");
    const blobs = await getAll("audioBlobs");
    db.close();
    const blobById = new Map(blobs.map((b) => [b.id as string, b]));
    const toBytes = async (blobId: string) => {
      const row = blobById.get(blobId);
      if (!row) throw new Error(`missing blob ${blobId}`);
      const buf = await (row.blob as Blob).arrayBuffer();
      return Array.from(new Uint8Array(buf));
    };
    const entry = entries.find((e) => e.meaning === target);
    if (!entry) throw new Error(`missing entry ${target}`);
    const recording = recordings.find(
      (r) => r.id === entry.elderRecordingId,
    );
    if (!recording || attempts.length === 0) {
      throw new Error("missing recording or attempt");
    }
    return {
      entryCount: entries.length,
      attemptCount: attempts.length,
      elderBytes: await toBytes(recording.audioBlobId as string),
      attemptBytes: await toBytes(attempts[0].audioBlobId as string),
    };
  }, meaning);
}

test("export, fresh-profile import, playback, and repeat import", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000); // two full browser profiles and three recordings

  // ---- Device A: record two words and one record-back, then export.
  const ctxA: BrowserContext = await browser.newContext({
    viewport: mobile,
    permissions: ["microphone"],
  });
  const pageA = await ctxA.newPage();

  await createEntry(pageA, "grandmother");
  // Record the child's attempt on the entry detail we landed on.
  const recordBtn = pageA.getByTestId("record-button");
  await recordBtn.click();
  await pageA.waitForTimeout(600);
  await recordBtn.click();
  await expect(pageA.getByTestId("attempt-play")).toBeVisible();

  await createEntry(pageA, "a blessing");

  await pageA.goto(`${baseURL}/data`);
  await expect(pageA.getByTestId("data-status")).toContainText(
    "2 words · 1 practice take",
  );
  await assertNoHorizontalScroll(pageA);

  const exportBtn = pageA.getByTestId("data-export");
  await expect(exportBtn).toHaveText("Save a backup");
  const [download] = await Promise.all([
    pageA.waitForEvent("download"),
    exportBtn.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^grandmas-dictionary-\d{4}-\d{2}-\d{2}\.zip$/,
  );
  const zipPath = testInfo.outputPath("family-backup.zip");
  await download.saveAs(zipPath);

  const original = await readStoredAudio(pageA, "grandmother");
  expect(original.entryCount).toBe(2);
  expect(original.attemptCount).toBe(1);
  await ctxA.close();

  // ---- Device B: a fresh profile opens the backup.
  const ctxB: BrowserContext = await browser.newContext({
    viewport: mobile,
    permissions: ["microphone"],
  });
  const pageB = await ctxB.newPage();

  await pageB.goto(`${baseURL}/data`);
  // Empty dictionary: the designed empty state leads with import.
  await expect(pageB.getByText("Bring your dictionary here")).toBeVisible();
  await expect(pageB.getByTestId("data-import")).toBeVisible();
  await assertNoHorizontalScroll(pageB);

  await pageB.getByTestId("data-import-input").setInputFiles(zipPath);
  await expect(pageB.getByTestId("import-success")).toContainText(
    "Added 2 words and 1 practice take.",
  );

  // The words are in the dictionary and play back.
  await pageB.goto(`${baseURL}/dictionary`);
  await expect(pageB.getByText("grandmother")).toBeVisible();
  await expect(pageB.getByText("a blessing")).toBeVisible();
  const play = pageB.getByTestId("entry-play").first();
  await play.click();
  await expect(play).toHaveAttribute("aria-label", /pause/i);

  // The imported audio is byte-identical to what device A recorded.
  const imported = await readStoredAudio(pageB, "grandmother");
  expect(imported.entryCount).toBe(2);
  expect(imported.attemptCount).toBe(1);
  expect(imported.elderBytes).toEqual(original.elderBytes);
  expect(imported.attemptBytes).toEqual(original.attemptBytes);

  // ---- Importing the same file again changes nothing.
  await pageB.goto(`${baseURL}/data`);
  await pageB.getByTestId("data-import-input").setInputFiles(zipPath);
  await expect(pageB.getByTestId("import-success")).toContainText(
    "Everything in that file is already here.",
  );
  const after = await readStoredAudio(pageB, "grandmother");
  expect(after.entryCount).toBe(2);
  expect(after.attemptCount).toBe(1);

  await ctxB.close();
});
