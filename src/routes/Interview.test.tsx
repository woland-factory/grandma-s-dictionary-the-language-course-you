import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { IDBFactory } from "fake-indexeddb";
import { Interview } from "./Interview";
import { DECK } from "../data/deck";
import * as capabilities from "../lib/capabilities";
import { _resetDBForTests, countEntries, listEntries } from "../lib/db";

// The nudge's export path is exercised without building a real zip.
const downloadArchiveMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/archive", () => ({
  downloadArchive: downloadArchiveMock,
}));

// A controllable stand-in for the media recorder: no getUserMedia, no
// MediaRecorder. start() flips to "recording" synchronously; stop() returns a
// small fake clip. This exercises the interview flow without real audio.
vi.mock("../lib/useRecorder", async () => {
  const { useState } = await import("react");
  return {
    useRecorder: () => {
      const [status, setStatus] = useState<"idle" | "recording">("idle");
      return {
        state: {
          status,
          elapsedMs: 0,
          errorKind: null,
          errorMessage: null,
        },
        start: () => setStatus("recording"),
        stop: async () => {
          setStatus("idle");
          return {
            blob: new Blob([new Uint8Array(64)], { type: "audio/webm" }),
            mimeType: "audio/webm",
            durationMs: 500,
          };
        },
        reset: () => setStatus("idle"),
      };
    },
  };
});

function renderInterview() {
  return render(
    <MemoryRouter>
      <Interview />
    </MemoryRouter>,
  );
}

// Record then stop, leaving the just-captured clip on screen.
async function recordOnce(user: ReturnType<typeof userEvent.setup>) {
  const btn = screen.getByTestId("record-button");
  await user.click(btn); // start
  await user.click(btn); // stop
  await screen.findByTestId("interview-save");
}

beforeEach(() => {
  vi.restoreAllMocks();
  downloadArchiveMock.mockReset().mockResolvedValue(undefined);
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
  // jsdom lacks object URLs; the AudioPlayer only needs them to be callable.
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

describe("Interview flow", () => {
  it("shows the first prompt and record button with no setup form first", () => {
    renderInterview();
    expect(screen.getByTestId("interview-prompt")).toHaveTextContent(
      DECK[0].text,
    );
    expect(screen.getByTestId("record-button")).toBeInTheDocument();
    expect(screen.getByTestId("interview-progress")).toHaveTextContent(
      `1 of ${DECK.length}`,
    );
    // No fields before recording.
    expect(screen.queryByLabelText(/what it means/i)).not.toBeInTheDocument();
  });

  it("saves one tagged entry with the default meaning when none is typed", async () => {
    const user = userEvent.setup();
    renderInterview();
    await recordOnce(user);
    await user.click(screen.getByTestId("interview-save"));

    await waitFor(async () => {
      expect(await countEntries()).toBe(1);
    });
    const rows = await listEntries();
    expect(rows[0].promptId).toBe(DECK[0].id);
    expect(rows[0].category).toBe(DECK[0].category);
    expect(rows[0].meaning).toBe(DECK[0].defaultMeaning);
    expect(rows[0].writtenForm).toBeUndefined();

    // Advances to the second prompt.
    await waitFor(() => {
      expect(screen.getByTestId("interview-progress")).toHaveTextContent(
        `2 of ${DECK.length}`,
      );
    });
  });

  it("persists a typed meaning and written form when provided", async () => {
    const user = userEvent.setup();
    renderInterview();
    await recordOnce(user);
    await user.type(screen.getByLabelText(/written form/i), "yiayia");
    await user.type(screen.getByLabelText(/what it means/i), "grandmother");
    await user.click(screen.getByTestId("interview-save"));

    await waitFor(async () => {
      expect(await countEntries()).toBe(1);
    });
    const rows = await listEntries();
    expect(rows[0].writtenForm).toBe("yiayia");
    expect(rows[0].meaning).toBe("grandmother");
  });

  it("skips a prompt without writing an entry", async () => {
    const user = userEvent.setup();
    renderInterview();
    await user.click(screen.getByTestId("interview-skip"));
    expect(screen.getByTestId("interview-progress")).toHaveTextContent(
      `2 of ${DECK.length}`,
    );
    expect(await countEntries()).toBe(0);
  });

  it("ends early via Done for now and shows the captured count", async () => {
    const user = userEvent.setup();
    renderInterview();
    await recordOnce(user);
    await user.click(screen.getByTestId("interview-save"));
    await screen.findByText(`2 of ${DECK.length}`);

    await user.click(screen.getByTestId("interview-done"));
    expect(screen.getByTestId("summary-count")).toHaveTextContent("1 word");
    expect(screen.getByTestId("summary-dictionary")).toBeInTheDocument();
  });

  it("shows a positive invite when nothing was captured", async () => {
    const user = userEvent.setup();
    renderInterview();
    await user.click(screen.getByTestId("interview-done"));
    expect(screen.getByTestId("summary-count")).toHaveTextContent(
      /ready when you are/i,
    );
    expect(screen.getByTestId("summary-dictionary")).toBeInTheDocument();
  });
});

describe("Interview export nudge", () => {
  it("nudges after a session with a saved word and exports in one tap", async () => {
    const user = userEvent.setup();
    renderInterview();
    await recordOnce(user);
    await user.click(screen.getByTestId("interview-save"));
    await screen.findByText(`2 of ${DECK.length}`);
    await user.click(screen.getByTestId("interview-done"));

    expect(screen.getByTestId("export-nudge")).toBeInTheDocument();
    await user.click(screen.getByTestId("nudge-export"));
    expect(downloadArchiveMock).toHaveBeenCalledOnce();
    await screen.findByTestId("nudge-saved");
  });

  it("dismisses with Not now", async () => {
    const user = userEvent.setup();
    renderInterview();
    await recordOnce(user);
    await user.click(screen.getByTestId("interview-save"));
    await screen.findByText(`2 of ${DECK.length}`);
    await user.click(screen.getByTestId("interview-done"));

    await user.click(screen.getByTestId("nudge-dismiss"));
    expect(screen.queryByTestId("export-nudge")).not.toBeInTheDocument();
    expect(downloadArchiveMock).not.toHaveBeenCalled();
  });

  it("stays away when the session saved nothing", async () => {
    const user = userEvent.setup();
    renderInterview();
    await user.click(screen.getByTestId("interview-done"));
    expect(screen.queryByTestId("export-nudge")).not.toBeInTheDocument();
  });
});
