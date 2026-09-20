import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanMeaning,
  cleanWrittenForm,
  MAX_MEANING,
  MAX_WRITTEN_FORM,
  pickMimeType,
} from "./audio";

const realMediaRecorder = (globalThis as { MediaRecorder?: unknown })
  .MediaRecorder;

afterEach(() => {
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = realMediaRecorder;
  vi.restoreAllMocks();
});

function stubIsTypeSupported(supported: string[]) {
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
    isTypeSupported: (t: string) => supported.includes(t),
  };
}

describe("pickMimeType", () => {
  it("picks the first supported preferred type", () => {
    stubIsTypeSupported(["audio/mp4", "audio/webm"]);
    // webm;codecs=opus not supported, plain webm is first supported.
    expect(pickMimeType()).toBe("audio/webm");
  });

  it("prefers opus webm when available", () => {
    stubIsTypeSupported(["audio/webm;codecs=opus", "audio/webm"]);
    expect(pickMimeType()).toBe("audio/webm;codecs=opus");
  });

  it("picks audio/mp4 on Safari, which supports only that format", () => {
    // Safari's MediaRecorder supports audio/mp4 (and audio/aac) but not webm.
    stubIsTypeSupported(["audio/mp4"]);
    expect(pickMimeType()).toBe("audio/mp4");
  });

  it("returns undefined when nothing is supported (let recorder choose)", () => {
    stubIsTypeSupported([]);
    expect(pickMimeType()).toBeUndefined();
  });

  it("returns undefined when MediaRecorder is missing", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = undefined;
    expect(pickMimeType()).toBeUndefined();
  });
});

describe("field caps", () => {
  it("trims and caps the written form", () => {
    expect(cleanWrittenForm("  hello  ")).toBe("hello");
    const long = "a".repeat(MAX_WRITTEN_FORM + 50);
    expect(cleanWrittenForm(long).length).toBe(MAX_WRITTEN_FORM);
  });

  it("trims and caps the meaning", () => {
    expect(cleanMeaning("  a blessing ")).toBe("a blessing");
    const long = "b".repeat(MAX_MEANING + 100);
    expect(cleanMeaning(long).length).toBe(MAX_MEANING);
  });
});
