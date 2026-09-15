import { useMemo, useState } from "react";
import { RecordButton } from "./RecordButton";
import { ErrorState } from "./states/ErrorState";
import { detectCapabilities } from "../lib/capabilities";
import { useRecorder } from "../lib/useRecorder";
import type { Recording } from "../lib/audio";

// One-tap record-back. Reuses the shared recorder, RecordButton, and the exact
// designed recorder-error / unsupported states from the capture screens. On
// stop it hands the finished clip to onCapture (which saves it as an attempt),
// then resets so the next attempt is one tap away. No fields, no review step.
export function RecordBack({
  label,
  onCapture,
}: {
  label: string;
  onCapture: (recording: Recording) => Promise<void>;
}) {
  const caps = useMemo(() => detectCapabilities(), []);
  const { state, start, stop, reset } = useRecorder();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!caps.canRecord) {
    return <UnsupportedState caps={caps} />;
  }

  if (state.status === "error") {
    return (
      <RecorderError
        kind={state.errorKind}
        message={state.errorMessage}
        onRetry={reset}
      />
    );
  }

  async function handleStop() {
    const result = await stop();
    if (!result) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onCapture(result);
    } catch {
      setSaveError("Saving did not finish. Check your space and try again.");
    } finally {
      setSaving(false);
      reset();
    }
  }

  return (
    <div className="card stack" style={{ alignItems: "center" }}>
      <p style={{ textAlign: "center", margin: 0 }}>{label}</p>
      <RecordButton
        status={saving ? "saving" : state.status}
        elapsedMs={state.elapsedMs}
        onStart={start}
        onStop={handleStop}
      />
      {saveError ? (
        <div className="notice notice--error" role="alert">
          <p style={{ margin: 0 }}>{saveError}</p>
        </div>
      ) : null}
    </div>
  );
}

// Same copy as the capture screens' recorder-error state.
function RecorderError({
  kind,
  message,
  onRetry,
}: {
  kind: string | null;
  message: string | null;
  onRetry: () => void;
}) {
  let title = "The microphone did not start";
  let body = message ?? "Try again in a moment.";
  if (kind === "denied") {
    title = "Turn on the microphone to record";
    body =
      "Allow microphone access for this site in your browser, then tap Try again.";
  } else if (kind === "notFound") {
    title = "No microphone found";
    body = "Plug in or turn on a microphone, then tap Try again.";
  }
  return (
    <ErrorState
      title={title}
      body={body}
      action={
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Try again
        </button>
      }
    />
  );
}

// Same copy as the capture screens' unsupported state.
function UnsupportedState({
  caps,
}: {
  caps: ReturnType<typeof detectCapabilities>;
}) {
  const title = !caps.secureContext
    ? "Open this over a secure connection to record"
    : "This browser cannot record audio";
  const body = !caps.secureContext
    ? "Recording needs an https address. Open the app over https, then come back to record."
    : "Open the app in a recent version of Chrome, Safari, Firefox, or Edge to record a word.";
  return <ErrorState icon="🎧" title={title} body={body} />;
}
