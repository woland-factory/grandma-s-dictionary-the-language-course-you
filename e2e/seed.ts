import { expect, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

// Shared seeding for the mic-free specs (webkit, a11y). Entries are seeded
// through the app's OWN validated import path (a zip built in Node), never by
// faking a recording. This file is not a spec, so Playwright does not collect
// it as tests.

// A valid, tiny 16-bit mono PCM WAV. Every browser engine decodes PCM WAV, so
// playback and the 'ended' event are reliable in headless WebKit.
export function makeWavBytes(seconds = 0.4, freq = 220, sampleRate = 8000): Uint8Array {
  const numSamples = Math.floor(seconds * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const amp = Math.sin(2 * Math.PI * freq * t) * 0.3 * 32767;
    view.setInt16(44 + i * 2, amp, true);
  }
  return new Uint8Array(buffer);
}

export interface ArchiveOptions {
  mimeType: string;
  ext: string;
  writtenForm: string;
  meaning: string;
}

// Builds a valid heirloom archive (one entry, one elder recording, one attempt)
// that the app's parseArchive accepts. The audio bytes are a real WAV; only the
// declared mimeType/extension change so the audio/mp4 path can be exercised too.
export function buildArchive(opts: ArchiveOptions): Buffer {
  const now = 1_700_000_000_000;
  const dictId = "wk-dict";
  const entryId = "wk-entry";
  const recId = "wk-rec";
  const elderAudioId = "wk-audio-elder";
  const attemptId = "wk-att";
  const attemptAudioId = "wk-audio-att";
  const elderBytes = makeWavBytes(0.4, 220);
  const attemptBytes = makeWavBytes(0.4, 330);
  const elderPath = `audio/${elderAudioId}.${opts.ext}`;
  const attemptPath = `audio/${attemptAudioId}.${opts.ext}`;

  const files: Record<string, [Uint8Array, { level: 0 }]> = {
    [elderPath]: [elderBytes, { level: 0 }],
    [attemptPath]: [attemptBytes, { level: 0 }],
  };
  const manifest = {
    format: "grandmas-dictionary",
    archiveVersion: 1,
    schemaVersion: 1,
    exportedAt: now,
    dictionary: { id: dictId, createdAt: now, schemaVersion: 1 },
    entries: [
      {
        id: entryId,
        dictionaryId: dictId,
        writtenForm: opts.writtenForm,
        meaning: opts.meaning,
        category: "kinship",
        elderRecordingId: recId,
        createdAt: now,
      },
    ],
    elderRecordings: [
      { id: recId, audioBlobId: elderAudioId, durationMs: 400, recordedAt: now },
    ],
    attempts: [
      {
        id: attemptId,
        entryId,
        audioBlobId: attemptAudioId,
        durationMs: 400,
        recordedAt: now,
      },
    ],
    revisits: [{ entryId, intervalIndex: 0, dueAt: now }],
    audio: [
      {
        id: elderAudioId,
        path: elderPath,
        mimeType: opts.mimeType,
        sizeBytes: elderBytes.byteLength,
      },
      {
        id: attemptAudioId,
        path: attemptPath,
        mimeType: opts.mimeType,
        sizeBytes: attemptBytes.byteLength,
      },
    ],
  };
  const withManifest = {
    ...files,
    "dictionary.json": strToU8(JSON.stringify(manifest)),
  };
  return Buffer.from(zipSync(withManifest));
}

// Seeds the dictionary by importing an archive through the real /data UI.
export async function seedViaImport(page: Page, opts: ArchiveOptions) {
  await page.goto("/data");
  await page.getByTestId("data-import-input").setInputFiles({
    name: "seed.zip",
    mimeType: "application/zip",
    buffer: buildArchive(opts),
  });
  await expect(page.getByTestId("import-success")).toContainText("Added");
}

export async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflow, "page must not scroll horizontally at 390px").toBe(false);
}

export const WAV = { mimeType: "audio/wav", ext: "wav" };
export const MP4 = { mimeType: "audio/mp4", ext: "m4a" };
