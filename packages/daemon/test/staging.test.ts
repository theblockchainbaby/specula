import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restore, stage } from "../src/staging.js";

test("restore reverts a file byte-for-byte to its staged contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "specula-staging-"));
  try {
    const file = join(dir, "page.tsx");
    writeFileSync(file, "original contents", "utf8");

    const snapshot = stage(file);
    writeFileSync(file, "edited — and broken", "utf8");
    assert.equal(readFileSync(file, "utf8"), "edited — and broken");

    restore(snapshot);
    assert.equal(readFileSync(file, "utf8"), "original contents");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
