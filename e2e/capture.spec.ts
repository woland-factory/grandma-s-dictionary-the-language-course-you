import { test, expect, type Page } from "@playwright/test";

// Chromium runs with fake media flags (see playwright.config.ts), so
// getUserMedia + MediaRecorder produce a real recordable stream with no mic.

test.use({ viewport: { width: 390, height: 844 } });

async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflow, "page should not scroll horizontally at 390px").toBe(false);
}

test("first paint shows real content, not a blank screen", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /keep your family's words/i }),
  ).toBeVisible();
  await expect(page.getByTestId("home-record")).toBeVisible();
  await assertNoHorizontalScroll(page);
});

test("record, add details, save, see it listed, and play it back", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("home-record").click();

  const recordBtn = page.getByTestId("record-button");
  await expect(recordBtn).toBeVisible();

  // Tap to start: the control enters its active state without waiting on media.
  await recordBtn.click();
  await expect(recordBtn).toHaveAttribute("aria-pressed", "true");

  // Let a moment of audio record, then stop.
  await page.waitForTimeout(700);
  await recordBtn.click();

  // Playback of the just-recorded audio appears.
  await expect(page.getByTestId("play-button")).toBeVisible();

  await page.getByLabel(/written form/i).fill("yiayia");
  await page.getByLabel(/what it means/i).fill("grandmother");
  await assertNoHorizontalScroll(page);

  await page.getByTestId("save-entry").click();

  // Lands on the entry detail with the word.
  await expect(page.getByRole("heading", { name: "yiayia" })).toBeVisible();

  // It appears in the dictionary and plays back.
  await page.goto("/dictionary");
  await expect(page.getByText("yiayia")).toBeVisible();
  const play = page.getByTestId("entry-play").first();
  await play.click();
  await expect(play).toHaveAttribute("aria-label", /pause/i);
  await assertNoHorizontalScroll(page);
});

test("saved entries survive a full reload", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-record").click();
  const recordBtn = page.getByTestId("record-button");
  await recordBtn.click();
  await page.waitForTimeout(600);
  await recordBtn.click();
  await expect(page.getByTestId("play-button")).toBeVisible();
  await page.getByLabel(/what it means/i).fill("a blessing");
  await page.getByTestId("save-entry").click();
  await expect(page.getByRole("heading", { name: "a blessing" })).toBeVisible();

  // Reload the app entirely.
  await page.goto("/dictionary");
  await page.reload();
  await expect(page.getByText("a blessing")).toBeVisible();
  const play = page.getByTestId("entry-play").first();
  await play.click();
  await expect(play).toHaveAttribute("aria-label", /pause/i);
});
