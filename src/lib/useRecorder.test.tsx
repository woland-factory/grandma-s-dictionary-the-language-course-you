import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRecorder } from "./useRecorder";

const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);
const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown })
  .MediaRecorder;

afterEach(() => {
  if (originalMediaDevices)
    Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder =
    originalMediaRecorder;
  vi.restoreAllMocks();
});

describe("useRecorder", () => {
  it("switches to a starting state synchronously, before getUserMedia resolves", () => {
    // getUserMedia never resolves: the visual state must still flip on tap.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => new Promise(() => {}) },
    });
    const { result } = renderHook(() => useRecorder());
    expect(result.current.state.status).toBe("idle");
    act(() => {
      result.current.start();
    });
    expect(result.current.state.status).toBe("starting");
  });

  it("shows a designed denied state when permission is refused", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(
            Object.assign(new Error("no"), { name: "NotAllowedError" }),
          ),
      },
    });
    const { result } = renderHook(() => useRecorder());
    act(() => {
      result.current.start();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe("error");
    });
    expect(result.current.state.errorKind).toBe("denied");
  });
});
