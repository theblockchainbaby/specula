/**
 * Project file discovery — finds the JSX-bearing source files the daemon must
 * analyze to build its source map.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".specula",
  "dist",
  "build",
  "target",
]);

const JSX_EXTENSIONS = new Set([".tsx", ".jsx"]);

/**
 * Recursively find JSX-bearing source files under `root`. Returns absolute
 * paths, sorted, with build/dependency directories skipped.
 */
export async function discoverSourceFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full);
      } else if (entry.isFile()) {
        const dot = entry.name.lastIndexOf(".");
        if (dot >= 0 && JSX_EXTENSIONS.has(entry.name.slice(dot))) {
          found.push(full);
        }
      }
    }
  }

  await walk(root);
  found.sort();
  return found;
}
