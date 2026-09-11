import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordButton } from "./RecordButton";

describe("RecordButton", () => {
  it("shows the idle state and starts on tap", async () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    render(
      <RecordButton
        status="idle"
        elapsedMs={0}
        onStart={onStart}
        onStop={onStop}
      />,
    );
    const btn = screen.getByTestId("record-button");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("record-label")).toHaveTextContent("Tap to record");
    await userEvent.click(btn);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("shows the recording state with a timer and stops on tap", async () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    render(
      <RecordButton
        status="recording"
        elapsedMs={65000}
        onStart={onStart}
        onStop={onStop}
      />,
    );
    const btn = screen.getByTestId("record-button");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn.className).toContain("record-btn--recording");
    expect(screen.getByRole("timer")).toHaveTextContent("1:05");
    await userEvent.click(btn);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
