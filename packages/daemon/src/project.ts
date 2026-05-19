/**
 * Project analysis — builds the daemon's source map by running `specula-analyze`
 * over every JSX-bearing file in the project.
 *
 * Each file is analyzed under its *project-relative* path. That is the
 * canonical Specula path: the same form the SWC plugin emits into `data-spc`,
 * so the map keys match the paths the overlay sends in `select` requests, and
 * no absolute author path is ever the identity of an element.
 */

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { discoverSourceFiles } from "./discover.js";
import { analyzeFile, SourceMap } from "./source-map.js";

export interface AnalyzeProjectResult {
  map: SourceMap;
  /** Files analyzed successfully — project-relative paths. */
  analyzed: string[];
  /** Files skipped because they did not parse — project-relative paths. */
  skipped: string[];
}

/** Analyze every JSX-bearing file under `root` into a [`SourceMap`]. */
export async function analyzeProject(
  analyzeBin: string,
  root: string,
): Promise<AnalyzeProjectResult> {
  const map = new SourceMap();
  const analyzed: string[] = [];
  const skipped: string[] = [];

  for (const file of await discoverSourceFiles(root)) {
    const source = await readFile(file, "utf8");
    // Analyze under the project-relative name — the canonical path the
    // overlay will resolve against. Disk I/O still uses the absolute `file`.
    const name = relative(root, file);
    try {
      map.add(await analyzeFile(analyzeBin, name, source));
      analyzed.push(name);
    } catch {
      // A file that fails to parse is skipped — the daemon stays up.
      skipped.push(name);
    }
  }

  return { map, analyzed, skipped };
}
