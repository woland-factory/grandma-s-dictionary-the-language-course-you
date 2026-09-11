import { useCallback, useEffect, useRef, useState } from "react";
import {
  Recorder,
  RecordingError,
  type PermissionErrorKind,
  type Recording,
} from "./audio";

export type RecorderStatus =
  | "idle"
  | "starting"
  | "recording"
  | "saving"
  | "error";

export interface RecorderState {
  status: RecorderStatus;
  elapsedMs: number;
  errorKind: PermissionErrorKind | null;
  errorMessage: string | null;
}

// Drives audio capture with feedback that switches synchronously on tap. The
// visual/timer state flips before getUserMedia resolves, so the record control
// responds within 100ms even when permission or the stream is slow.
export function useRecorder() {
  const recorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const [state, setState] = useState<RecorderState>({
    status: "idle",
    elapsedMs: 0,
    errorKind: null,
    errorMessage: null,
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    // Synchronous feedback first: switch to starting and run the timer before
    // any async work.
    startedAtRef.current = Date.now();
    setState({
      status: "starting",
      elapsedMs: 0,
      errorKind: null,
      errorMessage: null,
    });
    clearTimer();
    timerRef.current = setInterval(() => {
      setState((s) =>
        s.status === "starting" || s.status === "recording"
          ? { ...s, elapsedMs: Date.now() - startedAtRef.current }
          : s,
      );
    }, 200);

    const recorder = new Recorder();
    recorderRef.current = recorder;
    void recorder
      .start()
      .then(() => {
        setState((s) =>
          s.status === "starting" ? { ...s, status: "recording" } : s,
        );
      })
      .catch((err) => {
        clearTimer();
        const kind = err instanceof RecordingError ? err.kind : "unknown";
        setState({
          status: "error",
          elapsedMs: 0,
          errorKind: kind,
          errorMessage: null,
        });
      });
  }, [clearTimer]);

  const stop = useCallback(async (): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    setState((s) => ({ ...s, status: "saving" })); // synchronous feedback
    clearTimer();
    try {
      const result = await recorder.stop();
      setState((s) => ({ ...s, status: "idle" }));
      return result;
    } catch (err) {
      const message =
        err instanceof RecordingError ? err.message : "Recording failed.";
      setState({
        status: "error",
        elapsedMs: 0,
        errorKind: "unknown",
        errorMessage: message,
      });
      return null;
    } finally {
      recorderRef.current = null;
    }
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setState({
      status: "idle",
      elapsedMs: 0,
      errorKind: null,
      errorMessage: null,
    });
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
      recorderRef.current?.cancel();
    };
  }, [clearTimer]);

  return { state, start, stop, reset };
}
