import { afterEach, describe, expect, it } from "vitest";
import { formatBytes, getStorageStatus, requestPersistence } from "./storage";

const original = Object.getOwnPropertyDescriptor(navigator, "storage");

function setStorage(value: unknown) {
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, "storage", original);
});

describe("formatBytes", () => {
  it("formats across units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("getStorageStatus", () => {
  it("degrades to unsupported when the Storage API is missing", async () => {
    setStorage(undefined);
    const status = await getStorageStatus();
    expect(status.supported).toBe(false);
    expect(status.persisted).toBe(false);
  });

  it("surfaces persisted state and an estimate", async () => {
    setStorage({
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve({ usage: 2048, quota: 100000 }),
    });
    const status = await getStorageStatus();
    expect(status.supported).toBe(true);
    expect(status.persisted).toBe(true);
    expect(status.usageBytes).toBe(2048);
  });
});

describe("requestPersistence", () => {
  it("returns false without the Storage API", async () => {
    setStorage(undefined);
    expect(await requestPersistence()).toBe(false);
  });

  it("returns true when the browser grants persistence", async () => {
    setStorage({
      persisted: () => Promise.resolve(false),
      persist: () => Promise.resolve(true),
    });
    expect(await requestPersistence()).toBe(true);
  });
});
