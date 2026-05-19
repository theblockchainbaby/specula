/**
 * Transaction staging. Before any edit the daemon snapshots the target file in
 * memory; on rollback it writes the snapshot back. This works on non-git
 * projects and adds no dependency on repo state — see `specs/verification.md`.
 */

import { readFileSync, writeFileSync } from "node:fs";

/** An in-memory snapshot of a file, held for the life of a transaction. */
export interface Snapshot {
  file: string;
  content: string;
}

/** Capture a file's current contents before an edit. */
export function stage(file: string): Snapshot {
  return { file, content: readFileSync(file, "utf8") };
}

/** Restore a file to its snapshotted contents (transaction rollback). */
export function restore(snapshot: Snapshot): void {
  writeFileSync(snapshot.file, snapshot.content, "utf8");
}
