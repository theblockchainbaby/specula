/**
 * The edit-apply binding — runs `specula-edit` to apply a Tier-A edit to a
 * file's source. Same shape as the analyze binding: one Rust algorithm, the
 * daemon never reimplements it.
 */

import { execFile } from "node:child_process";

/** The verbs `specula-edit` understands — Tier-A property edits and the
 *  Tier-B structural verbs. */
export type EditVerb =
  | "edit-text"
  | "set-class"
  | "replace-asset"
  | "delete"
  | "duplicate"
  | "wrap"
  | "move";

/** The JSON shape `specula-edit` emits. */
export interface EditResult {
  ok: boolean;
  /** The rewritten source — present when `ok`. */
  source?: string;
  /** Why the edit was refused or failed — present when not `ok`. */
  reason?: string;
}

/**
 * Apply an edit to `source` via `specula-edit`. `value` is the new text
 * (`edit-text`), the final class string (`set-class`), or the `src`
 * (`replace-asset`).
 */
export function applyEdit(
  editBin: string,
  logicalName: string,
  source: string,
  verb: EditVerb,
  path: string,
  value: string,
): Promise<EditResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      editBin,
      [logicalName],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // A refused edit exits 0, a hard error exits non-zero — but both print
        // a JSON `{ ok: false, ... }`, so parse stdout whenever there is any.
        if (stdout.trim()) {
          try {
            resolve(JSON.parse(stdout) as EditResult);
            return;
          } catch {
            /* fall through to reject */
          }
        }
        reject(
          new Error(stderr.trim() || error?.message || "specula-edit: no output"),
        );
      },
    );
    child.stdin?.end(JSON.stringify({ source, verb, path, value }));
  });
}
