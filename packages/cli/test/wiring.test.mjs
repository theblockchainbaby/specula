import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkWiring,
  configHasPlugin,
  layoutHasOverlay,
} from "../src/wiring.mjs";

// --- configHasPlugin -------------------------------------------------------

test("configHasPlugin detects a configured Specula SWC plugin", () => {
  const config = `export default {
    experimental: { swcPlugins: [[speculaPlugin, { root: here }]] },
  };`;
  assert.equal(configHasPlugin(config), true);
});

test("configHasPlugin is false for a config without swcPlugins", () => {
  assert.equal(
    configHasPlugin("export default { reactStrictMode: true };"),
    false,
  );
});

test("configHasPlugin is false when swcPlugins holds an unrelated plugin", () => {
  const config = `export default {
    experimental: { swcPlugins: [["@some/other-plugin", {}]] },
  };`;
  assert.equal(configHasPlugin(config), false);
});

// --- layoutHasOverlay ------------------------------------------------------

test("layoutHasOverlay detects the overlay <script>", () => {
  const layout = "<script src={`http://127.0.0.1:${port}/specula.js`} async />";
  assert.equal(layoutHasOverlay(layout), true);
});

test("layoutHasOverlay is false for a layout without the overlay", () => {
  assert.equal(layoutHasOverlay("<body>{children}</body>"), false);
});

// --- checkWiring -----------------------------------------------------------

const WIRED_CONFIG = `export default {
  experimental: { swcPlugins: [[speculaPlugin, { root: here }]] },
};`;
const WIRED_LAYOUT =
  "<script src={`http://127.0.0.1:${port}/specula.js`} async />";

/**
 * A throwaway project; pass `null` to omit the next.config or the layout.
 * `appDir` defaults to "app" (the classic root convention); pass "src/app"
 * to exercise the equally common `src/`-prefixed layout.
 */
function project(configSource, layoutSource, appDir = "app") {
  const root = mkdtempSync(join(tmpdir(), "specula-wiring-"));
  if (configSource !== null) {
    writeFileSync(join(root, "next.config.mjs"), configSource, "utf8");
  }
  if (layoutSource !== null) {
    mkdirSync(join(root, appDir), { recursive: true });
    writeFileSync(join(root, appDir, "layout.tsx"), layoutSource, "utf8");
  }
  return root;
}

test("checkWiring passes a fully wired project", () => {
  const root = project(WIRED_CONFIG, WIRED_LAYOUT);
  try {
    assert.deepEqual(checkWiring(root), { ok: true, problems: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkWiring reports a missing next.config", () => {
  const root = project(null, WIRED_LAYOUT);
  try {
    const result = checkWiring(root);
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), /next\.config/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkWiring reports an unconfigured SWC plugin", () => {
  const root = project("export default {};", WIRED_LAYOUT);
  try {
    const result = checkWiring(root);
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), /SWC plugin/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkWiring passes a wired project that uses the src/app convention", () => {
  const root = project(WIRED_CONFIG, WIRED_LAYOUT, "src/app");
  try {
    assert.deepEqual(checkWiring(root), { ok: true, problems: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkWiring reports a layout that does not load the overlay", () => {
  const root = project(WIRED_CONFIG, "<body>{children}</body>");
  try {
    const result = checkWiring(root);
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), /overlay/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
