import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IDBFactory } from "fake-indexeddb";
import { Dictionary } from "./Dictionary";
import * as db from "../lib/db";
import { _resetDBForTests, listEntries, saveEntryWithRecording } from "../lib/db";

function makeBlob(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
}

function renderDictionary() {
  return render(
    <MemoryRouter>
      <Dictionary />
    </MemoryRouter>,
  );
}

async function seedEntries(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await saveEntryWithRecording({
      writtenForm: `word-${i}`,
      meaning: `meaning ${i}`,
      audio: { blob: makeBlob(40), mimeType: "audio/webm", durationMs: 300 },
    });
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dictionary load-error state", () => {
  it("shows the designed reload state when the initial read rejects", async () => {
    vi.spyOn(db, "listEntries").mockRejectedValueOnce(new Error("read failed"));
    renderDictionary();

    await screen.findByText("Reload to see your words");
    expect(
      screen.getByText(/your saved words stay on this device/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("load-error-reload")).toBeInTheDocument();
    // Not stuck on a skeleton and not showing the empty state.
    expect(screen.queryByText("Record your first word")).not.toBeInTheDocument();
  });
});

describe("Dictionary stays bounded and defers audio", () => {
  it("renders several hundred entries promptly without reading any audio up front", async () => {
    await seedEntries(300);
    const audioSpy = vi.spyOn(db, "getEntryAudio");

    renderDictionary();

    await waitFor(() =>
      expect(screen.getAllByTestId("entry-play").length).toBe(300),
    );
    // LazyEntryPlayer defers every blob read until first tap, so nothing loads
    // up front no matter how many rows there are.
    expect(audioSpy).not.toHaveBeenCalled();
  });

  it("caps the list read so it cannot grow without bound", async () => {
    await seedEntries(6);
    // The display cap is 500 in production; the same limit path caps here.
    expect((await listEntries(3)).length).toBe(3);
    expect((await listEntries()).length).toBe(6);
  });
});
