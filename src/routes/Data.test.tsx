import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { IDBFactory } from "fake-indexeddb";
import { Data } from "./Data";
import { ArchiveError } from "../lib/archive";
import {
  _resetDBForTests,
  saveAttempt,
  saveEntryWithRecording,
} from "../lib/db";

const archiveMocks = vi.hoisted(() => ({
  downloadArchive: vi.fn(),
  parseArchive: vi.fn(),
  importArchive: vi.fn(),
}));
vi.mock("../lib/archive", async () => {
  const actual = await vi.importActual<typeof import("../lib/archive")>(
    "../lib/archive",
  );
  return {
    ...actual,
    downloadArchive: archiveMocks.downloadArchive,
    parseArchive: archiveMocks.parseArchive,
    importArchive: archiveMocks.importArchive,
  };
});

const storageMocks = vi.hoisted(() => ({
  getStorageStatus: vi.fn(),
  requestPersistence: vi.fn(),
}));
vi.mock("../lib/storage", async () => {
  const actual = await vi.importActual<typeof import("../lib/storage")>(
    "../lib/storage",
  );
  return {
    ...actual,
    getStorageStatus: storageMocks.getStorageStatus,
    requestPersistence: storageMocks.requestPersistence,
  };
});

function makeBlob(bytes = 40): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
}

async function seedEntries(): Promise<void> {
  const { entry } = await saveEntryWithRecording({
    meaning: "grandmother",
    audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
  });
  await saveEntryWithRecording({
    meaning: "a blessing",
    audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
  });
  await saveAttempt(entry.id, {
    blob: makeBlob(),
    mimeType: "audio/webm",
    durationMs: 100,
  });
}

function renderData() {
  return render(
    <MemoryRouter>
      <Data />
    </MemoryRouter>,
  );
}

function uploadZip() {
  const file = new File([new Uint8Array(24)], "family.zip", {
    type: "application/zip",
  });
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(new ArrayBuffer(24)),
    });
  }
  fireEvent.change(screen.getByTestId("data-import-input"), {
    target: { files: [file] },
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
  archiveMocks.downloadArchive.mockReset().mockResolvedValue(undefined);
  archiveMocks.parseArchive.mockReset().mockReturnValue({});
  archiveMocks.importArchive
    .mockReset()
    .mockResolvedValue({ addedEntries: 0, addedAttempts: 0, skippedExisting: 0 });
  storageMocks.getStorageStatus.mockReset().mockResolvedValue({
    supported: true,
    persisted: false,
    usageBytes: 1_300_000,
    quotaBytes: 120_000_000,
  });
  storageMocks.requestPersistence.mockReset().mockResolvedValue(true);
});

describe("Data screen with entries", () => {
  it("leads with export, shows counts, storage, and an actionable persist button", async () => {
    await seedEntries();
    renderData();

    const exportBtn = await screen.findByTestId("data-export");
    expect(exportBtn).toHaveTextContent("Save a backup");
    expect(exportBtn.className).toContain("btn--primary");
    const importBtn = screen.getByTestId("data-import");
    expect(importBtn.className).toContain("btn--secondary");

    expect(screen.getByTestId("data-status")).toHaveTextContent(
      "2 words · 1 practice take",
    );
    expect(screen.getByTestId("data-status")).toHaveTextContent("1.2 MB used");
    expect(screen.getByTestId("data-status")).toHaveTextContent("114.4 MB");

    const persist = screen.getByTestId("data-persist");
    expect(persist).toHaveTextContent("Keep on this device");
    storageMocks.getStorageStatus.mockResolvedValue({
      supported: true,
      persisted: true,
      usageBytes: 1_300_000,
      quotaBytes: 120_000_000,
    });
    await userEvent.setup().click(persist);
    expect(storageMocks.requestPersistence).toHaveBeenCalledOnce();
    await screen.findByTestId("data-persisted");
  });

  it("shows inline progress while exporting, then triggers the download", async () => {
    await seedEntries();
    let finish: () => void = () => {};
    archiveMocks.downloadArchive.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    renderData();

    const exportBtn = await screen.findByTestId("data-export");
    await userEvent.setup().click(exportBtn);
    expect(exportBtn).toHaveTextContent("Preparing your file…");
    expect(archiveMocks.downloadArchive).toHaveBeenCalledOnce();

    finish();
    await waitFor(() => expect(exportBtn).toHaveTextContent("Save a backup"));
  });

  it("shows a designed export error with a retry", async () => {
    await seedEntries();
    archiveMocks.downloadArchive.mockRejectedValueOnce(new Error("quota"));
    renderData();

    await userEvent.setup().click(await screen.findByTestId("data-export"));
    await screen.findByText("The backup did not save");

    await userEvent.setup().click(screen.getByTestId("data-export-retry"));
    await screen.findByTestId("data-export");
    expect(archiveMocks.downloadArchive).toHaveBeenCalledTimes(2);
  });

  it("shows real counts after a successful import", async () => {
    await seedEntries();
    archiveMocks.importArchive.mockResolvedValue({
      addedEntries: 12,
      addedAttempts: 1,
      skippedExisting: 0,
    });
    renderData();
    await screen.findByTestId("data-export");

    uploadZip();
    await screen.findByText("Added 12 words and 1 practice take.");
    expect(screen.getByText("Open the dictionary")).toBeInTheDocument();
  });

  it("shows its own line when everything was already here", async () => {
    await seedEntries();
    archiveMocks.importArchive.mockResolvedValue({
      addedEntries: 0,
      addedAttempts: 0,
      skippedExisting: 3,
    });
    renderData();
    await screen.findByTestId("data-export");

    uploadZip();
    await screen.findByText("Everything in that file is already here.");
  });

  it("shows the designed error copy for a malformed file", async () => {
    await seedEntries();
    archiveMocks.parseArchive.mockImplementation(() => {
      throw new ArchiveError("wrongFormat", "nope");
    });
    renderData();
    await screen.findByTestId("data-export");

    uploadZip();
    await screen.findByText("That file did not open");
    expect(
      screen.getByText(
        "Choose a backup saved from this app, then try again. Your dictionary is unchanged.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Choose another file")).toBeInTheDocument();
    expect(archiveMocks.importArchive).not.toHaveBeenCalled();
  });

  it("shows the newer-version copy for a future archive", async () => {
    await seedEntries();
    archiveMocks.parseArchive.mockImplementation(() => {
      throw new ArchiveError("newerVersion", "future");
    });
    renderData();
    await screen.findByTestId("data-export");

    uploadZip();
    await screen.findByText("That backup needs a newer app");
    expect(
      screen.getByText("Update this app on this device, then open the file again."),
    ).toBeInTheDocument();
  });
});

describe("Data screen with an empty dictionary", () => {
  it("leads with import, offers recording, and hides export", async () => {
    renderData();

    await screen.findByText("Bring your dictionary here");
    const importBtn = screen.getByTestId("data-import");
    expect(importBtn).toHaveTextContent("Open a backup");
    expect(importBtn.className).toContain("btn--primary");
    expect(screen.getByText("Start recording")).toBeInTheDocument();
    expect(screen.queryByTestId("data-export")).not.toBeInTheDocument();
  });

  it("shows the designed error state on a bad file and keeps the dictionary untouched", async () => {
    archiveMocks.parseArchive.mockImplementation(() => {
      throw new ArchiveError("unreadable", "nope");
    });
    renderData();
    await screen.findByText("Bring your dictionary here");

    uploadZip();
    await screen.findByText("That file did not open");
    // Still the empty state: nothing was written.
    expect(screen.getByText("Bring your dictionary here")).toBeInTheDocument();
  });
});
