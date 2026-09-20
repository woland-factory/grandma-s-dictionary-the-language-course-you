import { test, expect, type Locator, type Page } from "@playwright/test";
import { seedViaImport, WAV } from "./seed";

// Keyboard reach and visible focus across the core screens. Button controls
// prove the visible focus ring under real keyboard navigation (Tab reaches them
// and :focus-visible draws the outline on every engine). Links prove they can
// receive focus. Home and the empty Data screen need no stored audio, so they
// run on both the desktop (Chromium) and mobile-webkit projects. Dictionary and
// an entry need seeded audio, which Playwright's Linux WebKit cannot store in
// IndexedDB, so their focus checks run on Chromium (see webkit.spec.ts).

// Tabs from the current position until the control holds focus, then asserts the
// focus ring is actually drawn (the global :focus-visible rule reaches it).
async function assertKeyboardRing(page: Page, locator: Locator, max = 25) {
  for (let i = 0; i < max; i++) {
    const focused = await locator
      .evaluate((el) => el === document.activeElement)
      .catch(() => false);
    if (focused) break;
    await page.keyboard.press("Tab");
  }
  await expect(locator).toBeFocused();
  expect(await locator.evaluate((el) => el.matches(":focus-visible"))).toBe(
    true,
  );
  const outline = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).not.toBe("0px");
}

// Links may not sit in the Tab order on every engine, but they must be able to
// receive focus (not removed from the tree with tabindex -1).
async function assertFocusable(locator: Locator) {
  await locator.focus();
  await expect(locator).toBeFocused();
}

function skipIfNoBlobStorage(testInfo: { project: { name: string } }) {
  test.skip(
    testInfo.project.name === "mobile-webkit",
    "Playwright's Linux WebKit cannot store Blobs in IndexedDB; seeded-screen focus runs on Chromium.",
  );
}

test("Home: the primary link is focusable and the skip control shows a focus ring", async ({
  page,
}) => {
  await page.goto("/");
  await assertFocusable(page.getByTestId("home-record"));
  // The first-run guide's Skip is a real button, reachable by keyboard.
  await assertKeyboardRing(page, page.getByTestId("first-run-skip"));
});

test("Data (empty): the import button shows a focus ring and links are focusable", async ({
  page,
}) => {
  await page.goto("/data");
  await expect(page.getByText("Bring your dictionary here")).toBeVisible();
  await assertKeyboardRing(page, page.getByTestId("data-import"));
  await assertFocusable(page.getByRole("link", { name: /start recording/i }));
});

test("Dictionary: the play button shows a focus ring and links are focusable", async ({
  page,
}, testInfo) => {
  skipIfNoBlobStorage(testInfo);
  await seedViaImport(page, {
    ...WAV,
    writtenForm: "yiayia",
    meaning: "grandmother",
  });
  await page.goto("/dictionary");
  await expect(page.getByText("yiayia")).toBeVisible();

  await assertKeyboardRing(page, page.getByTestId("entry-play").first());
  await assertFocusable(page.getByRole("link", { name: /record/i }).first());
});

test("Entry: the two-voice and record controls show a focus ring", async ({
  page,
}, testInfo) => {
  skipIfNoBlobStorage(testInfo);
  await seedViaImport(page, {
    ...WAV,
    writtenForm: "yiayia",
    meaning: "grandmother",
  });
  await page.goto("/dictionary");
  await page.getByText("yiayia").click();
  await expect(page.getByTestId("two-voice-play")).toBeVisible();

  await assertKeyboardRing(page, page.getByTestId("two-voice-play"));
  await assertKeyboardRing(page, page.getByTestId("record-button"));
});
