import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArchiveError,
  downloadArchive,
  importArchive,
  parseArchive,
  type ArchiveErrorKind,
  type ImportSummary,
} from "../lib/archive";
import { countAttempts, countEntries } from "../lib/db";
import {
  formatBytes,
  getStorageStatus,
  requestPersistence,
  type StorageStatus,
} from "../lib/storage";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingSkeleton } from "../components/states/LoadingSkeleton";

type ImportState =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "done"; summary: ImportSummary }
  | { phase: "error"; kind: ArchiveErrorKind };

// The heirloom-file screen: save the whole dictionary as one zip, or open a
// saved one. Export leads when there are words; an empty dictionary leads
// with import instead.
export function Data() {
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [attemptCount, setAttemptCount] = useState<number | null>(null);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [entries, attempts, status] = await Promise.all([
      countEntries(),
      countAttempts(),
      getStorageStatus(),
    ]);
    setEntryCount(entries);
    setAttemptCount(attempts);
    setStorage(status);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportFailed(false);
    try {
      await downloadArchive();
    } catch {
      setExportFailed(true);
    }
    setExporting(false);
  }

  async function handlePersist() {
    await requestPersistence();
    await refresh();
  }

  function pickFile() {
    fileRef.current?.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again fires another change event.
    event.target.value = "";
    if (!file) return;
    setImportState({ phase: "working" });
    try {
      const bytes = await file.arrayBuffer();
      const summary = await importArchive(parseArchive(bytes));
      setImportState({ phase: "done", summary });
      await refresh();
    } catch (err) {
      setImportState({
        phase: "error",
        kind: err instanceof ArchiveError ? err.kind : "unreadable",
      });
    }
  }

  const importing = importState.phase === "working";
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".zip,application/zip,application/x-zip-compressed"
      className="visually-hidden"
      tabIndex={-1}
      aria-label="Backup file"
      onChange={handleFile}
      data-testid="data-import-input"
    />
  );

  if (entryCount === null || attemptCount === null) {
    return (
      <div className="stack">
        <h1>Your family's file</h1>
        <LoadingSkeleton rows={3} />
      </div>
    );
  }

  if (entryCount === 0) {
    return (
      <div className="stack">
        <EmptyState
          icon="📦"
          title="Bring your dictionary here"
          body="Open a backup file from another device, or start recording to make one."
          action={
            <div className="stack" style={{ width: "100%" }}>
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={pickFile}
                disabled={importing}
                data-testid="data-import"
              >
                {importing ? "Opening…" : "Open a backup"}
              </button>
              <Link to="/interview" className="btn btn--ghost btn--block">
                Start recording
              </Link>
            </div>
          }
        />
        {importState.phase === "error" ? (
          <ImportError kind={importState.kind} onPick={pickFile} />
        ) : null}
        {fileInput}
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="stack" style={{ gap: 8 }}>
        <h1>Your family's file</h1>
        <p style={{ margin: 0 }}>
          One file holds every word, every voice, and every practice take.
        </p>
      </section>

      {exportFailed ? (
        <ErrorState
          icon="📦"
          title="The backup did not save"
          body="Check the space on this device, then try again."
          action={
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleExport}
              data-testid="data-export-retry"
            >
              Try again
            </button>
          }
        />
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={handleExport}
          disabled={exporting}
          aria-busy={exporting}
          data-testid="data-export"
        >
          {exporting ? "Preparing your file…" : "Save a backup"}
        </button>
      )}

      <div className="card stack" style={{ gap: 8 }} data-testid="data-status">
        <p style={{ margin: 0 }}>
          {entryCount} {entryCount === 1 ? "word" : "words"} · {attemptCount}{" "}
          {attemptCount === 1 ? "practice take" : "practice takes"}
        </p>
        {storage?.supported && typeof storage.usageBytes === "number" ? (
          <p style={{ margin: 0 }} className="muted">
            {formatBytes(storage.usageBytes)} used
            {typeof storage.quotaBytes === "number"
              ? ` of ${formatBytes(storage.quotaBytes)}`
              : ""}
          </p>
        ) : null}
        {storage?.supported ? (
          storage.persisted ? (
            <span className="badge" data-testid="data-persisted">
              Saved on this device
            </span>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handlePersist}
              data-testid="data-persist"
            >
              Keep on this device
            </button>
          )
        ) : null}
      </div>

      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={pickFile}
        disabled={importing}
        data-testid="data-import"
      >
        {importing ? "Opening…" : "Open a backup"}
      </button>

      {importState.phase === "done" ? (
        <div className="notice stack" style={{ gap: 8 }} role="status" data-testid="import-success">
          <p style={{ margin: 0 }}>{summaryLine(importState.summary)}</p>
          <Link to="/dictionary">Open the dictionary</Link>
        </div>
      ) : null}
      {importState.phase === "error" ? (
        <ImportError kind={importState.kind} onPick={pickFile} />
      ) : null}
      {fileInput}
    </div>
  );
}

function summaryLine(summary: ImportSummary): string {
  if (summary.addedEntries === 0 && summary.addedAttempts === 0) {
    return "Everything in that file is already here.";
  }
  const parts: string[] = [];
  if (summary.addedEntries > 0) {
    parts.push(
      `${summary.addedEntries} ${summary.addedEntries === 1 ? "word" : "words"}`,
    );
  }
  if (summary.addedAttempts > 0) {
    parts.push(
      `${summary.addedAttempts} ${
        summary.addedAttempts === 1 ? "practice take" : "practice takes"
      }`,
    );
  }
  return `Added ${parts.join(" and ")}.`;
}

function ImportError({
  kind,
  onPick,
}: {
  kind: ArchiveErrorKind;
  onPick: () => void;
}) {
  if (kind === "newerVersion") {
    return (
      <div data-testid="import-error">
        <ErrorState
          icon="📦"
          title="That backup needs a newer app"
          body="Update this app on this device, then open the file again."
        />
      </div>
    );
  }
  return (
    <div data-testid="import-error">
      <ErrorState
        icon="📦"
        title="That file did not open"
        body="Choose a backup saved from this app, then try again. Your dictionary is unchanged."
        action={
          <button type="button" className="btn btn--primary" onClick={onPick}>
            Choose another file
          </button>
        }
      />
    </div>
  );
}
