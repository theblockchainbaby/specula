import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeProject } from "../src/project.js";

const ANALYZE_BIN = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../specula-instrument/target/release/specula-analyze",
);

test("analyzeProject builds a SourceMap and skips files that do not parse", async () => {
  const root = mkdtempSync(join(tmpdir(), "specula-project-"));
  try {
    mkdirSync(join(root, "app"));
    const pageFile = join(root, "app", "page.tsx");
    writeFileSync(
      pageFile,
      "export default function Home(){return <main><h1>Hi</h1></main>;}",
    );
    writeFileSync(join(root, "app", "broken.tsx"), "export default function (");

    const { map, analyzed, skipped } = await analyzeProject(ANALYZE_BIN, root);

    assert.equal(analyzed.length, 1);
    assert.equal(skipped.length, 1);
    // The map is keyed by the project-relative path — the canonical Specula
    // path the SWC plugin emits into data-spc. No absolute author path.
    assert.ok(map.resolve("app/page.tsx#Home/main:0"));
    assert.equal(map.resolve("app/page.tsx#Home/main:0/h1:0")?.tag, "h1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
