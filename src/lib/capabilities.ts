// Feature detection for audio capture. Checked in order so the UI can show the
// right designed fallback instead of crashing when a capability is missing.

export interface Capabilities {
  secureContext: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  canRecord: boolean;
}

export function detectCapabilities(): Capabilities {
  const secureContext =
    typeof window !== "undefined" && window.isSecureContext === true;
  const getUserMedia =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";
  const mediaRecorder =
    typeof window !== "undefined" && typeof window.MediaRecorder === "function";

  return {
    secureContext,
    getUserMedia,
    mediaRecorder,
    canRecord: secureContext && getUserMedia && mediaRecorder,
  };
}
