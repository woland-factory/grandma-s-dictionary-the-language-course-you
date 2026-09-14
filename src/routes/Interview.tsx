import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { DECK, categoryLabel } from "../data/deck";

type Phase = "prompt" | "summary";

// The guided interview: one prompt at a time, one tap to record, and a session
// summary at the end. It is the app's capture surface. Each saved answer becomes
// a dictionary entry tagged with its prompt and category, through the same
// saveEntryWithRecording path /new uses.
export function Interview() {
  const caps = useMemo(() => detectCapabilities(), []);
  const { state, start, stop, reset } = useRecorder();

  const [index, setIndex] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [writtenForm, setWrittenForm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [capturedCount, setCapturedCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("prompt");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!caps.canRecord) {
    return <UnsupportedState caps={caps} />;
  }

  const prompt = DECK[index];

  function clearAnswer() {
    setRecording(null);
    setWrittenForm("");
    setMeaning("");
    setSaveError(null);
    reset();
  }

  function goToNext() {
    clearAnswer();
    if (index + 1 >= DECK.length) {
      setPhase("summary");
    } else {
      setIndex(index + 1);
    }
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
    if (!recording || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveEntryWithRecording({
        promptId: prompt.id,
        category: prompt.category,
        writtenForm: cleanWrittenForm(writtenForm) || undefined,
        meaning: cleanMeaning(meaning) || prompt.defaultMeaning,
        audio: {
          blob: recording.blob,
          mimeType: recording.mimeType,
          durationMs: recording.durationMs,
        },
      });
      setCapturedCount((n) => n + 1);
      setSaving(false);
      goToNext();
    } catch {
      setSaving(false);
      setSaveError("Saving did not finish. Check your space and try again.");
    }
  }

  function handleSkip() {
    goToNext();
  }

  function handleDone() {
    clearAnswer();
    setPhase("summary");
  }

  function handleStartAgain() {
    clearAnswer();
    setIndex(0);
    setCapturedCount(0);
    setPhase("prompt");
  }

  if (phase === "summary") {
    return (
      <InterviewSummary
        capturedCount={capturedCount}
        onStartAgain={handleStartAgain}
      />
    );
  }

  // Permission or device errors from the recorder. Same designed states as /new.
  if (state.status === "error") {
    return (
      <div className="stack">
        <h1>The interview</h1>
        <RecorderError
          kind={state.errorKind}
          message={state.errorMessage}
          onRetry={reset}
        />
      </div>
    );
  }

  const position = index + 1;
  const total = DECK.length;

  return (
    <div className="stack">
      <div className="interview__head">
        <p className="interview__category">{categoryLabel(prompt.category)}</p>
        <p className="interview__progress" data-testid="interview-progress">
          {position} of {total}
        </p>
        <div
          className="interview__bar"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={position}
          aria-label={`Prompt ${position} of ${total}`}
        >
          <span
            className="interview__bar-fill"
            style={{ width: `${(position / total) * 100}%` }}
          />
        </div>
      </div>

      <h1 className="interview__prompt" data-testid="interview-prompt">
        {prompt.text}
      </h1>

      {!recording ? (
        <>
          <div className="card stack" style={{ alignItems: "center" }}>
            <RecordButton
              status={state.status}
              elapsedMs={state.elapsedMs}
              onStart={start}
              onStop={handleStop}
            />
          </div>
          <div className="interview__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleSkip}
              data-testid="interview-skip"
            >
              Skip
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleDone}
              data-testid="interview-done"
            >
              Done for now
            </button>
          </div>
        </>
      ) : (
        <form className="stack" onSubmit={handleSave}>
          <div className="card stack" style={{ alignItems: "center", gap: 12 }}>
            <p style={{ margin: 0 }}>Here is what you recorded.</p>
            <AudioPlayer blob={recording.blob} label="your recording" />
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleReRecord}
              data-testid="interview-rerecord"
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
            <label htmlFor="meaning">What it means (optional)</label>
            <input
              id="meaning"
              name="meaning"
              type="text"
              value={meaning}
              maxLength={MAX_MEANING}
              autoComplete="off"
              onChange={(e) => setMeaning(e.target.value)}
              placeholder={prompt.defaultMeaning}
            />
            <span className="field__hint">A few words are plenty.</span>
          </div>

          {saveError ? (
            <div className="notice notice--error" role="alert">
              <p style={{ margin: 0 }}>{saveError}</p>
            </div>
          ) : null}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={saving}
            data-testid="interview-save"
          >
            {saving ? "Saving…" : "Save and next"}
          </button>
          <div className="interview__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleSkip}
              data-testid="interview-skip"
            >
              Skip
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleDone}
              data-testid="interview-done"
            >
              Done for now
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function InterviewSummary({
  capturedCount,
  onStartAgain,
}: {
  capturedCount: number;
  onStartAgain: () => void;
}) {
  const hasEntries = capturedCount > 0;
  return (
    <div className="stack">
      <div className="state">
        <div className="state__icon" aria-hidden="true">
          {hasEntries ? "🎉" : "🎙️"}
        </div>
        {hasEntries ? (
          <>
            <h1 data-testid="summary-count">
              {capturedCount} {capturedCount === 1 ? "word" : "words"} saved
            </h1>
            <p>
              Every one is in their voice now, safe on this device. Keep going or
              open your dictionary to hear them.
            </p>
          </>
        ) : (
          <>
            <h1 data-testid="summary-count">Ready when you are</h1>
            <p>
              Tap Start again to ask the first question and record a word in
              their voice.
            </p>
          </>
        )}
      </div>

      <Link
        to="/dictionary"
        className="btn btn--primary btn--block"
        data-testid="summary-dictionary"
      >
        Open the dictionary
      </Link>
      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={onStartAgain}
        data-testid="summary-again"
      >
        Start again
      </button>
      <Link to="/" className="btn btn--ghost btn--block">
        Back to start
      </Link>
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
      <h1>The interview</h1>
      <ErrorState icon="🎧" title={title} body={body} />
    </div>
  );
}
