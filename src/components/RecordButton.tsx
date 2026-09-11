import type { RecorderStatus } from "../lib/useRecorder";

interface RecordButtonProps {
  status: RecorderStatus;
  elapsedMs: number;
  onStart: () => void;
  onStop: () => void;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// The one primary action of capture. Its visual state and timer are driven by
// props the parent flips synchronously on tap, so feedback lands within 100ms.
export function RecordButton({
  status,
  elapsedMs,
  onStart,
  onStop,
}: RecordButtonProps) {
  const active = status === "recording" || status === "starting";
  const label =
    status === "starting"
      ? "Starting"
      : status === "recording"
        ? "Tap to stop"
        : status === "saving"
          ? "Saving"
          : "Tap to record";

  const cls =
    status === "recording"
      ? "record-btn record-btn--recording"
      : status === "starting"
        ? "record-btn record-btn--starting"
        : "record-btn record-btn--idle";

  return (
    <div className="recorder">
      <button
        type="button"
        className={cls}
        onClick={active ? onStop : onStart}
        disabled={status === "saving"}
        aria-pressed={active}
        aria-label={active ? "Stop recording" : "Record a word"}
        data-testid="record-button"
        data-status={status}
      >
        <span className="record-btn__dot" aria-hidden="true" />
      </button>
      <span className="recorder__label" data-testid="record-label">
        {label}
      </span>
      {active ? (
        <span className="recorder__timer" role="timer" aria-live="off">
          {formatTime(elapsedMs)}
        </span>
      ) : null}
    </div>
  );
}
