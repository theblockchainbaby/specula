/**
 * The transaction lifecycle skeleton — `specs/verification.md`.
 *
 * The pieces that need the AST machinery (classify, apply the edit, the
 * render/typecheck gates) are injected, so the *control flow* — stage,
 * serialize per file, run gates in order, commit or roll back — is real and
 * testable now. The contract invariant holds here: a transaction either
 * commits a gate-verified edit or restores the file byte-for-byte.
 */

import type { FileQueue } from "./file-queue.js";
import type { Snapshot } from "./staging.js";

/** A verification gate — `true` to pass, `false` (or a throw) to roll back. */
export type Gate = () => Promise<boolean> | boolean;

/** One transaction's plan. */
export interface TxStep {
  targetFile: string;
  /** Mutate the file on disk. */
  apply: () => Promise<void> | void;
  /** Gates run in order after `apply`; the first failure rolls back. */
  gates: Gate[];
}

export interface TxResult {
  ok: boolean;
  file: string;
  reason?: string;
}

export interface TxDeps {
  queue: FileQueue;
  stage: (file: string) => Snapshot;
  restore: (snapshot: Snapshot) => void;
}

/**
 * Run one transaction: stage → apply → gates → commit | rollback.
 * Serialized per file via the queue.
 */
export function runTransaction(step: TxStep, deps: TxDeps): Promise<TxResult> {
  return deps.queue.run(step.targetFile, async () => {
    const snapshot = deps.stage(step.targetFile);
    try {
      await step.apply();
      for (const gate of step.gates) {
        if (!(await gate())) {
          deps.restore(snapshot);
          return { ok: false, file: step.targetFile, reason: "gate rejected" };
        }
      }
      return { ok: true, file: step.targetFile };
    } catch (error) {
      deps.restore(snapshot);
      return {
        ok: false,
        file: step.targetFile,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
