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

// Record the current prompt, stop, then Save and next.
async function recordAndSave(page: Page) {
  const recordBtn = page.getByTestId("record-button");
  await expect(recordBtn).toBeVisible();
  await recordBtn.click();
  await expect(recordBtn).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  await recordBtn.click();
  await expect(page.getByTestId("interview-save")).toBeVisible();
  await page.getByTestId("interview-save").click();
}

test("two taps from home reach an active recording, no form in between", async ({
  page,
}) => {
  await page.goto("/");
  // Tap 1: the home primary opens the first prompt.
  await page.getByTestId("home-record").click();
  await expect(page.getByTestId("interview-prompt")).toBeVisible();
  await expect(page.getByTestId("interview-progress")).toContainText("1 of");

  // No setup form stands between landing and recording.
  await expect(page.getByLabel(/what it means/i)).toHaveCount(0);

  // Tap 2: the record button starts capture.
  const recordBtn = page.getByTestId("record-button");
  await recordBtn.click();
  await expect(recordBtn).toHaveAttribute("aria-pressed", "true");
  await assertNoHorizontalScroll(page);
});

test("a full pass saves tagged entries, skips one, and lands on the summary", async ({
  page,
}) => {
  await page.goto("/interview");

  // Save two, skip one.
  await recordAndSave(page);
  await recordAndSave(page);
  await page.getByTestId("interview-skip").click();
  await assertNoHorizontalScroll(page);

  // End the session and see the count.
  await page.getByTestId("interview-done").click();
  await expect(page.getByTestId("summary-count")).toContainText("2");

  // Open the dictionary: both entries appear, each with a category tag.
  await page.getByTestId("summary-dictionary").click();
  await expect(page).toHaveURL(/\/dictionary$/);
  const items = page.locator(".entry-item");
  await expect(items).toHaveCount(2);
  await expect(page.locator(".entry-item__tag").first()).toBeVisible();
  await assertNoHorizontalScroll(page);
});

test("record and skip are keyboard reachable with a visible focus ring", async ({
  page,
}) => {
  await page.goto("/interview");

  const recordBtn = page.getByTestId("record-button");
  const skip = page.getByTestId("interview-skip");

  // Tab into the page from the top until the record control holds focus.
  for (
    let i = 0;
    i < 8 && !(await recordBtn.evaluate((el) => el === document.activeElement));
    i++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(recordBtn).toBeFocused();
  // Keyboard focus matches :focus-visible, which draws the outline.
  expect(await recordBtn.evaluate((el) => el.matches(":focus-visible"))).toBe(
    true,
  );

  // The record control clears the 44px touch-target floor.
  const box = await recordBtn.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Tab continues to the subordinate Skip control.
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  expect(await skip.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
});
