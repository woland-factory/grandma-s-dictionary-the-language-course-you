// Audio capture via getUserMedia + MediaRecorder. Handles MIME selection so
// playback always matches what was recorded, cleans up the mic track when a
// recording ends, and enforces client-boundary caps (duration and size).

export const MAX_DURATION_MS = 120_000; // auto-stop at two minutes
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // reject blobs over 25 MB
export const MAX_WRITTEN_FORM = 200;
export const MAX_MEANING = 500;

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

// Picks the first supported MIME type. Returns undefined to let MediaRecorder
// choose its own default (we then read the real type off the recorder).
export function pickMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export type PermissionErrorKind = "denied" | "notFound" | "unknown";

export class RecordingError extends Error {
  kind: PermissionErrorKind;
  constructor(kind: PermissionErrorKind, message: string) {
    super(message);
    this.name = "RecordingError";
    this.kind = kind;
  }
}

function classifyGetUserMediaError(err: unknown): PermissionErrorKind {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "notFound";
  return "unknown";
}

// A single in-progress recording. start() requests the mic; stop() resolves
// with the finished blob and always releases the mic track.
export class Recorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private stopResolve: ((r: Recording) => void) | null = null;
  private stopReject: ((e: unknown) => void) | null = null;

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  // Requests the mic and begins recording. Throws RecordingError on a denied
  // or missing device so the caller can show the designed state.
  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      throw new RecordingError(
        classifyGetUserMediaError(err),
        "microphone unavailable",
      );
    }

    const chosen = pickMimeType();
    this.recorder = chosen
      ? new MediaRecorder(this.stream, { mimeType: chosen })
      : new MediaRecorder(this.stream);
    this.chunks = [];

    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this.finish();

    this.startedAt = Date.now();
    this.recorder.start();
    this.autoStopTimer = setTimeout(() => this.stop(), MAX_DURATION_MS);
  }

  // Stops recording and resolves with the finished blob.
  stop(): Promise<Recording> {
    return new Promise<Recording>((resolve, reject) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        reject(new RecordingError("unknown", "no active recording"));
        return;
      }
      this.stopResolve = resolve;
      this.stopReject = reject;
      this.recorder.stop();
    });
  }

  private finish(): void {
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    const durationMs = Date.now() - this.startedAt;
    const mimeType =
      this.recorder?.mimeType || this.chunks[0]?.type || "audio/webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    this.releaseTracks();

    const resolve = this.stopResolve;
    const reject = this.stopReject;
    this.stopResolve = null;
    this.stopReject = null;

    if (blob.size > MAX_AUDIO_BYTES) {
      reject?.(
        new RecordingError(
          "unknown",
          "That recording is too long to save. Try a shorter one.",
        ),
      );
      return;
    }
    resolve?.({ blob, mimeType, durationMs });
  }

  // Stops the mic track so the browser's recording indicator turns off.
  releaseTracks(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // Abandon a recording without saving.
  cancel(): void {
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.releaseTracks();
    this.stopResolve = null;
    this.stopReject = null;
  }
}

// Trim and cap the written form. Returns the cleaned value.
export function cleanWrittenForm(value: string): string {
  return value.trim().slice(0, MAX_WRITTEN_FORM);
}

// Trim and cap the meaning. Returns the cleaned value.
export function cleanMeaning(value: string): string {
  return value.trim().slice(0, MAX_MEANING);
}
