import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NewEntry } from "./NewEntry";
import * as capabilities from "../lib/capabilities";

function renderNewEntry() {
  return render(
    <MemoryRouter>
      <NewEntry />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("NewEntry unsupported states", () => {
  it("shows the insecure-context fallback with a next step, not a crash", () => {
    vi.spyOn(capabilities, "detectCapabilities").mockReturnValue({
      secureContext: false,
      getUserMedia: false,
      mediaRecorder: false,
      canRecord: false,
    });
    renderNewEntry();
    expect(
      screen.getByText(/secure connection to record/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/https/i)).toBeInTheDocument();
  });

  it("shows the unsupported-browser fallback when MediaRecorder is missing", () => {
    vi.spyOn(capabilities, "detectCapabilities").mockReturnValue({
      secureContext: true,
      getUserMedia: true,
      mediaRecorder: false,
      canRecord: false,
    });
    renderNewEntry();
    expect(
      screen.getByText(/cannot record audio/i),
    ).toBeInTheDocument();
  });

  it("shows the record control when recording is supported", () => {
    vi.spyOn(capabilities, "detectCapabilities").mockReturnValue({
      secureContext: true,
      getUserMedia: true,
      mediaRecorder: true,
      canRecord: true,
    });
    renderNewEntry();
    expect(screen.getByTestId("record-button")).toBeInTheDocument();
  });
});
