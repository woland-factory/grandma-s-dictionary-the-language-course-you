import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Mechanical copy sweep over user-visible source. Code comments are exempt per
// the quality bar, so block comments and whole-line comments are stripped
// before checking. Every remaining hit is a defect.

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = [
  join(ROOT, "src", "components"),
  join(ROOT, "src", "routes"),
];
const SCAN_FILES = [
  join(ROOT, "src", "App.tsx"),
  join(ROOT, "src", "main.tsx"),
  join(ROOT, ".env.example"),
  join(ROOT, "index.html"),
  join(ROOT, "public", "demo", "manifest.json"),
];

const BANNED = [
  /—/,
  /–/,
  /\bseamless(ly)?\b/i,
  /\beffortless(ly)?\b/i,
  /\bunlock\b/i,
  /\belevate\b/i,
  /\bempower\b/i,
  /\bleverage\b/i,
  /\brobust\b/i,
  /\bdive in\b/i,
  /in today's fast-paced world/i,
  /we've got you covered/i,
  /you don't have/i,
  /\bno .{0,20} yet\b/i,
  /nothing .{0,20} here/i,
  /\bunable to\b/i,
  /something went wrong/i,
];

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...collect(p));
    } else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("copy sweep", () => {
  const files = [...SCAN_DIRS.flatMap(collect), ...SCAN_FILES];

  it("scans a non-trivial set of files", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  for (const file of files) {
    it(`has clean copy: ${file.replace(ROOT + "/", "")}`, () => {
      const content = stripComments(readFileSync(file, "utf8"));
      for (const pattern of BANNED) {
        const match = content.match(pattern);
        expect(
          match,
          `banned pattern ${pattern} found: "${match?.[0]}"`,
        ).toBeNull();
      }
    });
  }
});
