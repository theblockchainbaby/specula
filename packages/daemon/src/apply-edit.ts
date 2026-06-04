/**
 * Running a Tier-A edit as a real transaction — `specs/verification.md`.
 *
 * This is where the transaction lifecycle stops being a skeleton: the `apply`
 * step rewrites the file through `specula-edit`, and a parse gate confirms the
 * result before the transaction commits. A refused edit or a gate failure
 * rolls the file back byte-for-byte.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyEdit } from "./edit.js";
import type { EditVerb } from "./edit.js";
import type { FileQueue } from "./file-queue.js";
import { analyzeFile } from "./source-map.js";
import { restore } from "./staging.js";
import { runTransaction } from "./transaction.js";
import type { TxResult } from "./transaction.js";

export interface EditOptions {
  /** Path to the `specula-edit` binary. */
  editBin: string;
  /** Path to the `specula-analyze` binary (used by the parse gate). */
  analyzeBin: string;
  /** The daemon's per-file serialization queue. */
  queue: FileQueue;
  /**
   * Project root. Element paths are project-relative (the canonical Specula
   * path); the root resolves them to absolute paths for disk I/O, and
   * `replace-asset` writes uploads under its `public/`.
   */
  projectRoot: string;
}

/**
 * Apply an edit to `file` as a transaction: stage → apply → parse gate →
 * commit | rollback. `targetPath` is the structural path of the element;
 * `file` is its project-relative path (the part before the `#`).
 *
 * `file` is the canonical name the analyze/edit binaries reason about; disk
 * I/O uses the absolute path resolved against `projectRoot`. The file is read
 * exactly once: the staged snapshot and the edit's input are the same bytes,
 * so a rollback can never restore content the edit never saw.
 */
export async function runEdit(
  file: string,
  verb: EditVerb,
  targetPath: string,
  value: string,
  options: EditOptions,
  attr?: string,
): Promise<TxResult> {
  const absolute = join(options.projectRoot, file);
  const source = await readFile(absolute, "utf8");
  return runTransaction(
    {
      targetFile: absolute,
      apply: async () => {
        const result = await applyEdit(
          options.editBin,
          file,
          source,
          verb,
          targetPath,
          value,
          attr,
        );
        if (!result.ok || result.source === undefined) {
          throw new Error(result.reason ?? `${verb} was refused`);
        }
        await writeFile(absolute, result.source, "utf8");
      },
      gates: [
        // Parse gate: the rewritten file must still parse as valid TSX.
        async () => {
          await analyzeFile(
            options.analyzeBin,
            file,
            await readFile(absolute, "utf8"),
          );
          return true;
        },
      ],
    },
    {
      queue: options.queue,
      // Stage the bytes already read — never a second, possibly-changed read.
      stage: () => ({ file: absolute, content: source }),
      restore,
    },
  );
}
