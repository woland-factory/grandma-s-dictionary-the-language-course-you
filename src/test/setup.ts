import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";

// jsdom's Blob is not structured-cloneable by Node's structuredClone, which
// fake-indexeddb uses, so a stored Blob comes back empty. Node's own Blob is
// web-compatible and clones correctly. Real browsers are unaffected.
globalThis.Blob = NodeBlob as unknown as typeof Blob;

afterEach(() => {
  cleanup();
});
