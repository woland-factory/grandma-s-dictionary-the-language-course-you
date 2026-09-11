import { useEffect, useState } from "react";
import { formatBytes, getStorageStatus, type StorageStatus } from "../lib/storage";

// Small readout of whether storage is persisted and how much space is used.
// Degrades to a plain "not available" line where the Storage API is missing.
export function StorageStatusBar() {
  const [status, setStatus] = useState<StorageStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void getStorageStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!status) {
    return (
      <div className="storage-status" data-testid="storage-status">
        <span className="muted">Checking storage…</span>
      </div>
    );
  }

  if (!status.supported) {
    return (
      <div className="storage-status" data-testid="storage-status">
        <span className="muted">Storage details are not available in this browser.</span>
      </div>
    );
  }

  return (
    <div className="storage-status" data-testid="storage-status">
      <span
        className={status.persisted ? "badge" : "badge badge--off"}
        data-testid="persist-badge"
      >
        {status.persisted ? "Saved on this device" : "Ask to keep on this device"}
      </span>
      {typeof status.usageBytes === "number" ? (
        <span>{formatBytes(status.usageBytes)} used</span>
      ) : null}
    </div>
  );
}
