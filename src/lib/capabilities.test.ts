import { afterEach, describe, expect, it } from "vitest";
import { detectCapabilities } from "./capabilities";

const originalDescriptors = {
  isSecureContext: Object.getOwnPropertyDescriptor(window, "isSecureContext"),
  MediaRecorder: (globalThis as { MediaRecorder?: unknown }).MediaRecorder,
};

function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (originalDescriptors.isSecureContext) {
    Object.defineProperty(
      window,
      "isSecureContext",
      originalDescriptors.isSecureContext,
    );
  }
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder =
    originalDescriptors.MediaRecorder;
});

describe("detectCapabilities", () => {
  it("reports canRecord only when all three are present", () => {
    setSecureContext(true);
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = function () {};
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve() },
    });
    const caps = detectCapabilities();
    expect(caps.canRecord).toBe(true);
  });

  it("is not recordable in an insecure context", () => {
    setSecureContext(false);
    const caps = detectCapabilities();
    expect(caps.secureContext).toBe(false);
    expect(caps.canRecord).toBe(false);
  });

  it("is not recordable without MediaRecorder", () => {
    setSecureContext(true);
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = undefined;
    const caps = detectCapabilities();
    expect(caps.mediaRecorder).toBe(false);
    expect(caps.canRecord).toBe(false);
  });
});
