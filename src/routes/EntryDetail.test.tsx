import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { IDBFactory } from "fake-indexeddb";
import { EntryDetail } from "./EntryDetail";
import * as capabilities from "../lib/capabilities";
import * as db from "../lib/db";
import {
  _resetDBForTests,
  listAttempts,
  saveAttempt,
  saveEntryWithRecording,
  getEntryAudio,
  getEntry,
} from "../lib/db";

// A controllable recorder: start() flips to recording; stop() returns a small
// fake clip. Mirrors Interview.test / NewEntry conventions.
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

const playOrder: string[] = [];
const playedEls: HTMLMediaElement[] = [];
const createdUrls: string[] = [];

function makeBlob(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
}

function renderEntry(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/entry/${id}`]}>
      <Routes>
        <Route path="/entry/:id" element={<EntryDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  playOrder.length = 0;
  playedEls.length = 0;
  createdUrls.length = 0;
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();

  // jsdom lacks object URLs; provide callable stubs before spying on them.
  if (!("createObjectURL" in URL)) {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () =>
      "blob:test";
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
  }
  let counter = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const url = `blob:${counter++}`;
    createdUrls.push(url);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  // jsdom does not implement play(); record call order and the element so the
  // test can advance the two-voice sequence by dispatching "ended" itself.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    playOrder.push(this.src);
    playedEls.push(this);
    return Promise.resolve();
  });

  vi.spyOn(capabilities, "detectCapabilities").mockReturnValue({
    secureContext: true,
    getUserMedia: true,
    mediaRecorder: true,
    canRecord: true,
  });
});

async function seedEntry(): Promise<string> {
  const { entry } = await saveEntryWithRecording({
    writtenForm: "yiayia",
    meaning: "grandmother",
    audio: { blob: makeBlob(80), mimeType: "audio/webm", durationMs: 1000 },
  });
  return entry.id;
}

describe("EntryDetail two-voice + record-back", () => {
  it("with no attempt, Play plays only the elder and invites the first record-back", async () => {
    const id = await seedEntry();
    renderEntry(id);

    const play = await screen.findByTestId("two-voice-play");
    expect(play).toHaveTextContent(/play in their voice/i);
    // The record-back invites the first attempt.
    expect(screen.getByText(/say it back/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(play);
    // Pressed feedback flips synchronously on tap.
    expect(play).toHaveAttribute("aria-pressed", "true");
    // Only the elder source is played (the first created URL).
    expect(playOrder).toEqual([createdUrls[0]]);

    // When the elder ends there is no attempt to chain to, so playback stops.
    await act(async () => {
      playedEls[0].dispatchEvent(new Event("ended"));
    });
    expect(playOrder).toEqual([createdUrls[0]]);
    expect(play).toHaveAttribute("aria-pressed", "false");
  });

  it("records a record-back, storing an attempt beside an untouched elder", async () => {
    const id = await seedEntry();
    const elderBefore = await getEntryAudio((await getEntry(id))!);
    renderEntry(id);
    await screen.findByTestId("two-voice-play");

    const user = userEvent.setup();
    const recordBtn = screen.getByTestId("record-button");
    await user.click(recordBtn); // start
    await user.click(recordBtn); // stop -> saves the attempt

    await waitFor(async () => {
      expect((await listAttempts(id)).length).toBe(1);
    });

    // The elder recording is unchanged.
    const elderAfter = await getEntryAudio((await getEntry(id))!);
    expect(elderAfter?.sizeBytes).toBe(elderBefore?.sizeBytes);
    expect(elderAfter?.sizeBytes).toBe(80);

    // The new attempt shows in history and is individually playable.
    await waitFor(() =>
      expect(screen.getByTestId("attempt-play")).toBeInTheDocument(),
    );
  });

  it("shows the designed reload state when the entry read rejects", async () => {
    vi.spyOn(db, "getEntry").mockRejectedValueOnce(new Error("read failed"));
    renderEntry("any-id");

    expect(await screen.findByText("Reload to see your words")).toBeInTheDocument();
    expect(screen.getByTestId("load-error-reload")).toBeInTheDocument();
    // Not the missing-entry empty state and not a stuck skeleton.
    expect(screen.queryByText("This word is not here")).not.toBeInTheDocument();
  });

  it("plays both voices once, marking the two-voice moment via meta and event", async () => {
    const id = await seedEntry();
    await saveAttempt(id, {
      blob: makeBlob(40),
      mimeType: "audio/webm",
      durationMs: 500,
    });
    const events: string[] = [];
    const listener = () => events.push("two-voice-played");
    window.addEventListener("two-voice-played", listener);

    renderEntry(id);
    const play = await screen.findByTestId("two-voice-play");

    const user = userEvent.setup();
    await user.click(play); // elder plays first
    await act(async () => {
      playedEls[0].dispatchEvent(new Event("ended")); // crosses into the attempt
    });

    await waitFor(async () =>
      expect(await db.getMeta<boolean>("twoVoicePlayed")).toBe(true),
    );
    expect(events).toEqual(["two-voice-played"]);
    window.removeEventListener("two-voice-played", listener);
  });

  it("with an attempt present, Play plays the elder then the latest attempt in order", async () => {
    const id = await seedEntry();
    await saveAttempt(id, {
      blob: makeBlob(40),
      mimeType: "audio/webm",
      durationMs: 500,
    });
    renderEntry(id);

    const play = await screen.findByTestId("two-voice-play");
    expect(play).toHaveTextContent(/play both voices/i);

    const user = userEvent.setup();
    await user.click(play);

    // Pressed feedback flips synchronously on tap; the elder plays first.
    expect(play).toHaveAttribute("aria-pressed", "true");
    expect(playOrder).toEqual([createdUrls[0]]);

    // When the elder ends, the latest attempt plays next.
    await act(async () => {
      playedEls[0].dispatchEvent(new Event("ended"));
    });
    await waitFor(() => expect(playOrder).toEqual([createdUrls[0], createdUrls[1]]));
  });
});
