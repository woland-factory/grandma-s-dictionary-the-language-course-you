import { test, expect } from "@playwright/test";
import { seedViaImport, WAV } from "./seed";

// The guided first run in the real built app on Home. Chromium-only: it seeds
// through the import path (stored audio), which Playwright's Linux WebKit cannot
// do. The self-tick, skip, and hidden-when-complete logic is also covered in
// isolation by src/components/FirstRunGuide.test.tsx.
test.use({ viewport: { width: 390, height: 844 } });

test("a fresh visitor sees the three-step guide with step one as the next step", async ({
  page,
}) => {
  await page.goto("/");

  const guide = page.getByTestId("first-run");
  await expect(guide).toBeVisible();
  const next = page.getByTestId("first-run-next");
  await expect(next).toHaveText("Record a word in their voice.");
  await expect(next).toHaveAttribute("href", /\/interview$/);

  // The hero stays the single primary action; the guide adds no second primary.
  await expect(page.getByTestId("home-record")).toHaveClass(/btn--primary/);
  await expect(page.locator("main .btn--primary")).toHaveCount(1);
});

test("Skip hides the guide for good, across a full reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("first-run")).toBeVisible();

  await page.getByTestId("first-run-skip").click();
  await expect(page.getByTestId("first-run")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("home-record")).toBeVisible();
  await expect(page.getByTestId("first-run")).toHaveCount(0);
});

test("with a demo dictionary present, steps one and two are pre-ticked", async ({
  page,
}) => {
  await seedViaImport(page, {
    ...WAV,
    writtenForm: "yiayia",
    meaning: "grandmother",
  });

  await page.goto("/");
  const next = page.getByTestId("first-run-next");
  await expect(next).toHaveText("Play both voices.");
  await expect(next).toHaveAttribute("href", /\/dictionary$/);
  await expect(page.getByTestId("first-run-step-recorded")).toContainText(
    "Record a word in their voice.",
  );
});
