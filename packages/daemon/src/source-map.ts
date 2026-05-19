/**
 * The daemon's source map — the authoritative model of every instrumented JSX
 * element. Built by spawning `specula-analyze` (the analyze-mode binding), so
 * the daemon and the SWC plugin share exactly one path algorithm — see
 * `specs/identity.md`.
 */

import { execFile } from "node:child_process";

/** One instrumented element — the JSON shape emitted by `specula-analyze`. */
export interface MapEntry {
  path: string;
  file: string;
  tag: string;
  kind: "host" | "component";
  env: "server" | "client";
  /** Static text content — present only when the element is text-only. */
  text?: string;
  /** The `className` value — present only when it is a static string literal. */
  className?: string;
  /** The `src` value — present only when it is a static string literal. */
  src?: string;
  /** Byte offsets of the element in its source file. */
  lo: number;
  hi: number;
}

/** Run `specula-analyze` on one file's source and return its map entries. */
export function analyzeFile(
  binPath: string,
  logicalName: string,
  source: string,
): Promise<MapEntry[]> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binPath,
      [logicalName],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as MapEntry[]);
        } catch (parseError) {
          reject(
            parseError instanceof Error
              ? parseError
              : new Error(String(parseError)),
          );
        }
      },
    );
    child.stdin?.end(source);
  });
}

/**
 * The in-memory source map, keyed by structural path. `add` is idempotent per
 * path — re-analyzing a file replaces its entries.
 */
export class SourceMap {
  readonly #byPath = new Map<string, MapEntry>();

  /** Insert or replace entries. */
  add(entries: readonly MapEntry[]): void {
    for (const entry of entries) this.#byPath.set(entry.path, entry);
  }

  /** The entry at `path`, if any. */
  resolve(path: string): MapEntry | undefined {
    return this.#byPath.get(path);
  }

  /** How many entries are held. */
  get size(): number {
    return this.#byPath.size;
  }

  /**
   * The structural ancestor chain within a file: the entry at `path`, then its
   * parent, up to the outermost element. Trims one `/segment` at a time and
   * stops at the `#` — the owner root is a namespace, not an element.
   *
   * This is the *within-file* ladder. The overlay builds the cross-file
   * selection ladder by walking the DOM.
   */
  ladder(path: string): MapEntry[] {
    const rungs: MapEntry[] = [];
    let current: string | undefined = path;
    while (current !== undefined) {
      const entry = this.#byPath.get(current);
      if (entry) rungs.push(entry);
      const hash = current.indexOf("#");
      const slash = current.lastIndexOf("/");
      current = slash > hash ? current.slice(0, slash) : undefined;
    }
    return rungs;
  }
}
