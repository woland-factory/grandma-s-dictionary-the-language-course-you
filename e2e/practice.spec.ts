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

// Record one word via /new and land on its entry detail.
async function createEntry(page: Page, meaning: string) {
  await page.goto("/new");
  const recordBtn = page.getByTestId("record-button");
  await recordBtn.click();
  await page.waitForTimeout(600);
  await recordBtn.click();
  await expect(page.getByTestId("play-button")).toBeVisible();
  await page.getByLabel(/what it means/i).fill(meaning);
  await page.getByTestId("save-entry").click();
  await expect(page.getByRole("heading", { name: meaning })).toBeVisible();
}

test("record a record-back on an entry and hear both voices", async ({
  page,
}) => {
  await createEntry(page, "grandmother");

  // The signature two-voice control is present; its pressed state flips on tap.
  const play = page.getByTestId("two-voice-play");
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "true");

  // Record a child attempt: one tap to start, one to stop.
  const recordBtn = page.getByTestId("record-button");
  await expect(recordBtn).toBeVisible();
  await recordBtn.click();
  await expect(recordBtn).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  await recordBtn.click();

  // The attempt appears in the history with a date and its own play control.
  const attemptPlay = page.getByTestId("attempt-play");
  await expect(attemptPlay).toBeVisible();
  await expect(attemptPlay).toHaveAttribute("aria-label", /said back on/i);
  await attemptPlay.click();
  await expect(attemptPlay).toHaveAttribute("aria-label", /pause/i);

  await assertNoHorizontalScroll(page);
});

test("practice loop surfaces the due entry and advances after a record-back", async ({
  page,
}) => {
  await createEntry(page, "a blessing");

  // Home shows the subordinate Practice link once there is a word to practice.
  await page.goto("/");
  const practiceLink = page.getByTestId("home-practice");
  await expect(practiceLink).toBeVisible();
  await practiceLink.click();

  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByTestId("practice-progress")).toContainText(
    "to practice",
  );
  await assertNoHorizontalScroll(page);

  // Record a record-back: the entry advances out of the due window and the
  // queue empties, showing the caught-up state.
  const recordBtn = page.getByTestId("record-button");
  await recordBtn.click();
  await page.waitForTimeout(600);
  await recordBtn.click();

  await expect(page.getByText(/all caught up/i)).toBeVisible();
  await expect(page.getByTestId("practice-open-dictionary")).toBeVisible();
  await assertNoHorizontalScroll(page);
});

test("two-voice Play and record-back are keyboard reachable with visible focus", async ({
  page,
}) => {
  await createEntry(page, "grandmother");

  const play = page.getByTestId("two-voice-play");
  const recordBtn = page.getByTestId("record-button");

  // Tab from the top until the two-voice Play holds focus.
  for (
    let i = 0;
    i < 8 && !(await play.evaluate((el) => el === document.activeElement));
    i++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(play).toBeFocused();
  expect(await play.evaluate((el) => el.matches(":focus-visible"))).toBe(true);

  // Tab continues to the record-back control.
  for (
    let i = 0;
    i < 8 &&
    !(await recordBtn.evaluate((el) => el === document.activeElement));
    i++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(recordBtn).toBeFocused();
  expect(await recordBtn.evaluate((el) => el.matches(":focus-visible"))).toBe(
    true,
  );

  // The record control clears the 44px touch-target floor.
  const box = await recordBtn.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
