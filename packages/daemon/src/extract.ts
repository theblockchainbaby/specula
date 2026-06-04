/**
 * Extract-component — pull a selected element out into its own .tsx file and
 * replace it in the original with a reference to the new component.
 *
 * This verb is a multi-file transaction. The orchestration lives here; the
 * trust invariant is preserved via a backup-and-rollback wrapper in the
 * handler. The helpers in this file are pure and tested in isolation.
 *
 * v1 scope:
 * - Component name must be PascalCase. The user provides it via the
 *   inspector's Extract input.
 * - The new file is placed at <projectRoot>/{components,src/components}/<Name>.tsx
 *   depending on which folder exists in the project.
 * - The extracted element is inserted as the body of `return ( … )`. Existing
 *   indentation is preserved as-is — minimal-diff style.
 * - The original file gets exactly two changes: a new `import` line after the
 *   last existing import, and the element's span replaced with `<Name />`.
 * - Self-closing replacement only — no children passed through. Wave 2 can
 *   add a children-aware variant.
 */

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { MapEntry } from "./source-map.js";
import { analyzeFile } from "./source-map.js";

/** True if the string is a valid PascalCase JSX component name. */
export function isValidComponentName(name: string): boolean {
  if (!name) return false;
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/** Wrap the extracted JSX `body` in a default-exported function component. */
export function composeComponentFile(name: string, body: string): string {
  // The body comes from inside the original file with whatever indentation
  // it had. We leave its inner structure alone but place it under a clean
  // 4-space indent inside the new return.
  const trimmedBody = body.trim();
  const indentedBody = trimmedBody
    .split("\n")
    .map((line, i) => (i === 0 ? `    ${line}` : `    ${line.replace(/^\s+/, "")}`))
    .join("\n");
  return `export function ${name}() {
  return (
${indentedBody}
  );
}
`;
}

/** Build the modified original: add an import (after existing imports) and
 *  replace the byte span [start, end) with `<Name />`. */
export function buildModifiedOriginal(
  original: string,
  start: number,
  end: number,
  name: string,
  importPath: string,
): string {
  const importLine = `import ${name} from "${importPath}";`;
  // First do the element replacement on the existing source.
  const replaced =
    original.slice(0, start) + `<${name} />` + original.slice(end);

  // Find where to insert the new import — after the last top-level import
  // statement, or at the very start when there are none.
  const importBlockMatch = replaced.match(
    /^(import[^\n]*\n)+(\s*\n)?/m,
  );
  if (importBlockMatch && importBlockMatch.index === 0) {
    // There is a leading block of imports; the new import goes right after.
    const blockEnd = importBlockMatch.index + importBlockMatch[0].length;
    const block = importBlockMatch[0];
    // If the block ended in a blank line, we keep it.
    const importChunk = block.replace(/(\s*\n)?$/, "");
    const blank = block.slice(importChunk.length);
    return (
      importChunk + "\n" + importLine + (blank || "\n") + replaced.slice(blockEnd)
    );
  }
  // No leading imports — put one at the very top.
  return importLine + "\n" + replaced;
}

/** Find the components directory for this project — prefer `src/components`
 *  when `src/app` exists, otherwise plain `components`. */
export function chooseComponentDir(projectRoot: string): string {
  if (existsSync(join(projectRoot, "src", "app"))) {
    return join(projectRoot, "src", "components");
  }
  return join(projectRoot, "components");
}

/** Compute a relative import path FROM `from` (an absolute file path) TO
 *  `to` (an absolute file path). Strips the `.tsx` extension and prefixes
 *  with `./` when needed. */
export function relativeImportPath(from: string, to: string): string {
  const rel = relative(dirname(from), to).replace(/\.tsx$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

export interface ExtractOptions {
  analyzeBin: string;
  projectRoot: string;
}

export interface ExtractResult {
  ok: boolean;
  reason?: string;
  /** Project-relative path of the new file. */
  newFile?: string;
}

/** Orchestrate the multi-file extract. Atomic w.r.t. failures: any error
 *  rolls back both files to their pre-edit state. */
export async function runExtract(
  entry: MapEntry,
  name: string,
  options: ExtractOptions,
): Promise<ExtractResult> {
  if (!isValidComponentName(name)) {
    return { ok: false, reason: `invalid component name: ${name}` };
  }
  const originalAbs = join(options.projectRoot, entry.file);
  const originalBefore = await readFile(originalAbs, "utf8");
  const elementSource = originalBefore.slice(entry.lo, entry.hi);

  const componentDir = chooseComponentDir(options.projectRoot);
  const newFileAbs = join(componentDir, `${name}.tsx`);
  const newFileExisted = existsSync(newFileAbs);
  const newFileBefore = newFileExisted
    ? await readFile(newFileAbs, "utf8")
    : null;

  const newFileContent = composeComponentFile(name, elementSource);
  const importPath = relativeImportPath(originalAbs, newFileAbs);
  const modifiedOriginal = buildModifiedOriginal(
    originalBefore,
    entry.lo,
    entry.hi,
    name,
    importPath,
  );

  const rollback = async (): Promise<void> => {
    await writeFile(originalAbs, originalBefore, "utf8");
    if (newFileExisted && newFileBefore !== null) {
      await writeFile(newFileAbs, newFileBefore, "utf8");
    } else {
      await unlink(newFileAbs).catch(() => {});
    }
  };

  try {
    await mkdir(componentDir, { recursive: true });
    await writeFile(newFileAbs, newFileContent, "utf8");
    await writeFile(originalAbs, modifiedOriginal, "utf8");
    // Parse gates on both files. analyzeFile throws on parse errors.
    await analyzeFile(options.analyzeBin, `${name}.tsx`, newFileContent);
    await analyzeFile(options.analyzeBin, entry.file, modifiedOriginal);
    return {
      ok: true,
      newFile: relative(options.projectRoot, newFileAbs),
    };
  } catch (err) {
    await rollback().catch(() => {});
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
