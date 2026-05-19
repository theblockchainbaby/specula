import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileQueue } from "../src/file-queue.js";
import { restore, stage } from "../src/staging.js";
import { runTransaction } from "../src/transaction.js";

function tempFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "specula-tx-"));
  const file = join(dir, "page.tsx");
  writeFileSync(file, contents, "utf8");
  return file;
}

function deps() {
  return { queue: new FileQueue(), stage, restore };
}

test("a transaction whose gates all pass commits the edit", async () => {
  const file = tempFile("original");
  const result = await runTransaction(
    {
      targetFile: file,
      apply: () => writeFileSync(file, "edited", "utf8"),
      gates: [() => true, async () => true],
    },
    deps(),
  );
  assert.equal(result.ok, true);
  assert.equal(readFileSync(file, "utf8"), "edited");
  rmSync(file, { force: true });
});

test("a failing gate rolls the file back to its staged contents", async () => {
  const file = tempFile("original");
  const result = await runTransaction(
    {
      targetFile: file,
      apply: () => writeFileSync(file, "broken edit", "utf8"),
      gates: [() => true, () => false],
    },
    deps(),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "gate rejected");
  // The invariant: a rejected transaction leaves no trace.
  assert.equal(readFileSync(file, "utf8"), "original");
  rmSync(file, { force: true });
});

test("a throwing apply rolls back and reports the error", async () => {
  const file = tempFile("original");
  const result = await runTransaction(
    {
      targetFile: file,
      apply: () => {
        writeFileSync(file, "half-written", "utf8");
        throw new Error("apply failed");
      },
      gates: [],
    },
    deps(),
  );
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /apply failed/);
  assert.equal(readFileSync(file, "utf8"), "original");
  rmSync(file, { force: true });
});
