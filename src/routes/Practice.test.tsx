import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { IDBFactory } from "fake-indexeddb";
import { Practice } from "./Practice";
import * as capabilities from "../lib/capabilities";
import {
  _resetDBForTests,
  getDB,
  getRevisit,
  saveEntryWithRecording,
} from "../lib/db";

// The nudge's export path is exercised without building a real zip.
const downloadArchiveMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/archive", () => ({
  downloadArchive: downloadArchiveMock,
}));

vi.mock("../lib/useRecorder", async () => {
  const { useState } = await import("react");
  return {
    useRecorder: () => {
      const [status, setStatus] = useState<"idle" | "recording">("idle");
      return {
        state: { status, elapsedMs: 0, errorKind: null, errorMessage: null },
        start: () => setStatus("recording"),
        stop: async () => {
          setStatus("idle");
          return {
            blob: new Blob([new Uint8Array(40)], { type: "audio/webm" }),
            mimeType: "audio/webm",
            durationMs: 500,
          };
        },
        reset: () => setStatus("idle"),
      };
    },
  };
});

function makeBlob(bytes = 40): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
}

function renderPractice() {
  return render(
    <MemoryRouter>
      <Practice />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  downloadArchiveMock.mockReset().mockResolvedValue(undefined);
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
  if (!("createObjectURL" in URL)) {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () =>
      "blob:test";
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
  }
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(capabilities, "detectCapabilities").mockReturnValue({
    secureContext: true,
    getUserMedia: true,
    mediaRecorder: true,
    canRecord: true,
  });
});

// Saves an entry, then forces its revisit dueAt so we control the queue.
async function seedDue(meaning: string, dueAt: number): Promise<string> {
  const { entry } = await saveEntryWithRecording({
    meaning,
    audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
  });
  const db = await getDB();
  await db.put("revisit", { entryId: entry.id, intervalIndex: 0, dueAt });
  return entry.id;
}

describe("Practice due queue", () => {
  it("surfaces only due entries and advances after a record-back", async () => {
    const now = Date.now();
    await seedDue("due now", now - 1000);
    const futureId = await seedDue("later", now + 7 * 24 * 60 * 60 * 1000);

    renderPractice();

    // Only the due entry surfaces.
    await screen.findByText("due now");
    expect(screen.queryByText("later")).not.toBeInTheDocument();
    expect(screen.getByTestId("practice-progress")).toHaveTextContent(
      "1 of 1 to practice",
    );

    // Record a record-back: the entry advances out of the due window and the
    // queue empties, showing the caught-up state.
    const user = userEvent.setup();
    const recordBtn = screen.getByTestId("record-button");
    await user.click(recordBtn); // start
    await user.click(recordBtn); // stop -> saveAttempt advances the schedule

    await screen.findByText(/all caught up/i);

    // The future entry is still not due; it was never surfaced or advanced.
    const futureRevisit = await getRevisit(futureId);
    expect(futureRevisit?.intervalIndex).toBe(0);
  });

  it("moves to the next due entry when Skip is tapped, without advancing it", async () => {
    const now = Date.now();
    const firstId = await seedDue("first", now - 2000);
    await seedDue("second", now - 1000);

    renderPractice();
    await screen.findByText("first");
    expect(screen.getByTestId("practice-progress")).toHaveTextContent("1 of 2");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("practice-skip"));

    await screen.findByText("second");
    expect(screen.getByTestId("practice-progress")).toHaveTextContent("2 of 2");

    // Skipping did not record or advance the skipped entry's schedule.
    const firstRevisit = await getRevisit(firstId);
    expect(firstRevisit?.intervalIndex).toBe(0);
  });

  it("shows a designed, positive empty state when nothing is due", async () => {
    const now = Date.now();
    await seedDue("later", now + 24 * 60 * 60 * 1000);

    renderPractice();

    await screen.findByText(/all caught up/i);
    expect(screen.getByTestId("practice-open-dictionary")).toBeInTheDocument();
    // No streak or badge language.
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
    // No takes saved this session: nothing new to back up, no nudge.
    expect(screen.queryByTestId("export-nudge")).not.toBeInTheDocument();
  });
});

describe("Practice export nudge", () => {
  it("nudges on caught-up after a saved take, exports in one tap, and dismisses", async () => {
    await seedDue("due now", Date.now() - 1000);
    renderPractice();
    await screen.findByText("due now");

    const user = userEvent.setup();
    const recordBtn = screen.getByTestId("record-button");
    await user.click(recordBtn); // start
    await user.click(recordBtn); // stop -> saveAttempt

    await screen.findByText(/all caught up/i);
    expect(screen.getByTestId("export-nudge")).toBeInTheDocument();

    await user.click(screen.getByTestId("nudge-export"));
    expect(downloadArchiveMock).toHaveBeenCalledOnce();
    await screen.findByTestId("nudge-saved");
  });

  it("stays away when the session only skipped", async () => {
    await seedDue("due now", Date.now() - 1000);
    renderPractice();
    await screen.findByText("due now");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("practice-skip"));

    await screen.findByText(/all caught up/i);
    expect(screen.queryByTestId("export-nudge")).not.toBeInTheDocument();
  });

  it("Not now hides the nudge for that view", async () => {
    await seedDue("due now", Date.now() - 1000);
    renderPractice();
    await screen.findByText("due now");

    const user = userEvent.setup();
    const recordBtn = screen.getByTestId("record-button");
    await user.click(recordBtn);
    await user.click(recordBtn);
    await screen.findByText(/all caught up/i);

    await user.click(screen.getByTestId("nudge-dismiss"));
    expect(screen.queryByTestId("export-nudge")).not.toBeInTheDocument();
    expect(downloadArchiveMock).not.toHaveBeenCalled();
  });
});
