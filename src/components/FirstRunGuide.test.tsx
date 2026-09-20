import { describe, expect, it, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { IDBFactory } from "fake-indexeddb";
import { FirstRunGuide } from "./FirstRunGuide";
import {
  _resetDBForTests,
  getMeta,
  saveAttempt,
  saveEntryWithRecording,
  setMeta,
} from "../lib/db";

function makeBlob(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
}

function renderGuide() {
  return render(
    <MemoryRouter>
      <FirstRunGuide />
    </MemoryRouter>,
  );
}

async function seedEntry(): Promise<string> {
  const { entry } = await saveEntryWithRecording({
    meaning: "grandmother",
    audio: { blob: makeBlob(80), mimeType: "audio/webm", durationMs: 1000 },
  });
  return entry.id;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
});

describe("FirstRunGuide", () => {
  it("on a fresh profile shows three steps with step 1 as the highlighted next step", async () => {
    renderGuide();

    await screen.findByTestId("first-run");
    expect(
      screen.getByText("Your first word in three steps"),
    ).toBeInTheDocument();

    // All three sentences are present.
    expect(screen.getByText("Record a word in their voice.")).toBeInTheDocument();
    expect(screen.getByText("Say it back.")).toBeInTheDocument();
    expect(screen.getByText("Play both voices.")).toBeInTheDocument();

    // The first not-done step is the highlighted next-step link (btn--secondary,
    // never a second btn--primary).
    const next = screen.getByTestId("first-run-next");
    expect(next).toHaveTextContent("Record a word in their voice.");
    expect(next.className).toContain("btn--secondary");
    expect(next.className).not.toContain("btn--primary");
    expect(next).toHaveAttribute("href", "/interview");

    // Skip is present at every step.
    expect(screen.getByTestId("first-run-skip")).toBeInTheDocument();
  });

  it("ticks each step from live state as the events fire", async () => {
    renderGuide();
    await screen.findByTestId("first-run");

    // Record a word: step 1 ticks, the next step becomes "Say it back.".
    const id = await seedEntry();
    await act(async () => {
      window.dispatchEvent(new Event("demo-seeded"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("first-run-next")).toHaveTextContent(
        "Say it back.",
      ),
    );
    expect(screen.getByTestId("first-run-step-recorded").className).toContain(
      "first-run__step--done",
    );

    // Record a say-it-back: step 2 ticks, the next step becomes "Play both voices.".
    await saveAttempt(id, {
      blob: makeBlob(40),
      mimeType: "audio/webm",
      durationMs: 500,
    });
    await act(async () => {
      window.dispatchEvent(new Event("demo-seeded"));
    });
    await waitFor(() => {
      const next = screen.getByTestId("first-run-next");
      expect(next).toHaveTextContent("Play both voices.");
      expect(next).toHaveAttribute("href", "/dictionary");
    });

    // Play both voices: the last step ticks and the whole guide disappears.
    await setMeta("twoVoicePlayed", true);
    await act(async () => {
      window.dispatchEvent(new Event("two-voice-played"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("first-run")).not.toBeInTheDocument(),
    );
    expect(await getMeta<boolean>("firstRunComplete")).toBe(true);
  });

  it("with the demo seed present, steps 1 and 2 are pre-ticked and the next step plays both voices", async () => {
    const id = await seedEntry();
    await saveAttempt(id, {
      blob: makeBlob(40),
      mimeType: "audio/webm",
      durationMs: 500,
    });

    renderGuide();

    await waitFor(() => {
      const next = screen.getByTestId("first-run-next");
      expect(next).toHaveTextContent("Play both voices.");
      expect(next).toHaveAttribute("href", "/dictionary");
    });
    expect(screen.getByTestId("first-run-step-recorded").className).toContain(
      "first-run__step--done",
    );
    expect(screen.getByTestId("first-run-step-saidBack").className).toContain(
      "first-run__step--done",
    );
  });

  it("Skip hides the guide immediately and permanently", async () => {
    renderGuide();
    const skip = await screen.findByTestId("first-run-skip");

    const user = userEvent.setup();
    await user.click(skip);

    await waitFor(() =>
      expect(screen.queryByTestId("first-run")).not.toBeInTheDocument(),
    );
    expect(await getMeta<boolean>("firstRunComplete")).toBe(true);

    // A returning user never sees it again.
    renderGuide();
    await waitFor(() => {
      expect(screen.queryByTestId("first-run")).not.toBeInTheDocument();
    });
  });

  it("never renders when firstRunComplete is already set", async () => {
    await setMeta("firstRunComplete", true);
    renderGuide();

    // Give the mount effect time to resolve; the card must stay absent.
    await waitFor(() =>
      expect(screen.queryByTestId("first-run")).not.toBeInTheDocument(),
    );
  });
});
