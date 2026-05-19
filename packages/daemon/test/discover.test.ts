import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSourceFiles } from "../src/discover.js";

test("discoverSourceFiles finds .tsx/.jsx and skips build/dependency dirs", async () => {
  const root = mkdtempSync(join(tmpdir(), "specula-discover-"));
  try {
    mkdirSync(join(root, "app"));
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "app", "page.tsx"), "x");
    writeFileSync(join(root, "app", "layout.jsx"), "x");
    writeFileSync(join(root, "app", "util.ts"), "x"); // not JSX-bearing
    writeFileSync(join(root, "node_modules", "pkg", "index.tsx"), "x"); // skipped

    const relative = (await discoverSourceFiles(root))
      .map((file) => file.slice(root.length + 1))
      .sort();

    assert.deepEqual(relative, [
      join("app", "layout.jsx"),
      join("app", "page.tsx"),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
