import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RecordButton } from "../components/RecordButton";
import { AudioPlayer } from "../components/AudioPlayer";
import { ErrorState } from "../components/states/ErrorState";
import { detectCapabilities } from "../lib/capabilities";
import { useRecorder } from "../lib/useRecorder";
import {
  cleanMeaning,
  cleanWrittenForm,
  MAX_MEANING,
  MAX_WRITTEN_FORM,
  type Recording,
} from "../lib/audio";
import { saveEntryWithRecording } from "../lib/db";

// Record elder audio, add a written form and meaning, save, and play it back.
export function NewEntry() {
  const navigate = useNavigate();
  const caps = useMemo(() => detectCapabilities(), []);
  const { state, start, stop, reset } = useRecorder();

  const [recording, setRecording] = useState<Recording | null>(null);
  const [writtenForm, setWrittenForm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!caps.canRecord) {
    return <UnsupportedState caps={caps} />;
  }

  async function handleStop() {
    const result = await stop();
    if (result) setRecording(result);
  }

  function handleReRecord() {
    setRecording(null);
    reset();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!recording) return;
    const cleanedMeaning = cleanMeaning(meaning);
    if (!cleanedMeaning) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { entry } = await saveEntryWithRecording({
        writtenForm: cleanWrittenForm(writtenForm) || undefined,
        meaning: cleanedMeaning,
        audio: {
          blob: recording.blob,
          mimeType: recording.mimeType,
          durationMs: recording.durationMs,
        },
      });
      navigate(`/entry/${entry.id}`);
    } catch {
      setSaving(false);
      setSaveError("Saving did not finish. Check your space and try again.");
    }
  }

  // Permission or device errors from the recorder.
  if (state.status === "error") {
    return (
      <div className="stack">
        <h1>Record a word</h1>
        <RecorderError
          kind={state.errorKind}
          message={state.errorMessage}
          onRetry={reset}
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Record a word</h1>

      {!recording ? (
        <div className="card stack" style={{ alignItems: "center" }}>
          <p style={{ textAlign: "center", margin: 0 }}>
            Ask them to say one word. Tap the circle, then tap again to stop.
          </p>
          <RecordButton
            status={state.status}
            elapsedMs={state.elapsedMs}
            onStart={start}
            onStop={handleStop}
          />
        </div>
      ) : (
        <form className="stack" onSubmit={handleSave}>
          <div className="card stack" style={{ alignItems: "center", gap: 12 }}>
            <p style={{ margin: 0 }}>Here is what you recorded.</p>
            <AudioPlayer blob={recording.blob} label="your recording" />
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleReRecord}
            >
              Record again
            </button>
          </div>

          <div className="field">
            <label htmlFor="writtenForm">Written form (optional)</label>
            <input
              id="writtenForm"
              name="writtenForm"
              type="text"
              value={writtenForm}
              maxLength={MAX_WRITTEN_FORM}
              autoComplete="off"
              onChange={(e) => setWrittenForm(e.target.value)}
              placeholder="How you spell it"
            />
          </div>

          <div className="field">
            <label htmlFor="meaning">What it means</label>
            <input
              id="meaning"
              name="meaning"
              type="text"
              value={meaning}
              maxLength={MAX_MEANING}
              autoComplete="off"
              onChange={(e) => setMeaning(e.target.value)}
              placeholder="Grandmother, or a blessing before dinner"
              required
            />
            <span className="field__hint">
              A few words are plenty.
            </span>
          </div>

          {saveError ? (
            <div className="notice notice--error" role="alert">
              <p style={{ margin: 0 }}>{saveError}</p>
            </div>
          ) : null}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={saving || !cleanMeaning(meaning)}
            data-testid="save-entry"
          >
            {saving ? "Saving…" : "Save this word"}
          </button>
        </form>
      )}
    </div>
  );
}

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
  let body =
    message ?? "Try again in a moment.";
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
  return (
    <div className="stack">
      <h1>Record a word</h1>
      <ErrorState icon="🎧" title={title} body={body} />
    </div>
  );
}
