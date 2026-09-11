// Persistent-storage helpers. All degrade to a plain readout when the Storage
// API is missing, never throwing.

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

// Ask the browser to keep our data across storage pressure. Safe to call on
// every boot; returns the resulting persisted state.
export async function requestPersistence(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.persist !== "function"
  ) {
    return false;
  }
  try {
    if (
      typeof navigator.storage.persisted === "function" &&
      (await navigator.storage.persisted())
    ) {
      return true;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return { supported: false, persisted: false };
  }
  let persisted = false;
  if (typeof navigator.storage.persisted === "function") {
    try {
      persisted = await navigator.storage.persisted();
    } catch {
      persisted = false;
    }
  }
  let usageBytes: number | undefined;
  let quotaBytes: number | undefined;
  if (typeof navigator.storage.estimate === "function") {
    try {
      const est = await navigator.storage.estimate();
      usageBytes = est.usage;
      quotaBytes = est.quota;
    } catch {
      // leave undefined
    }
  }
  return { supported: true, persisted, usageBytes, quotaBytes };
}

// Human-readable byte size, e.g. "1.2 MB". Kept small and dependency-free.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
