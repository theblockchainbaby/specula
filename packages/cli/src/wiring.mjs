/**
 * Wiring detection.
 *
 * Before `specula dev` starts anything, it confirms the target project has
 * the two pieces of Specula wiring: the SWC plugin in `next.config`, and the
 * overlay `<script>` in the App Router root layout. An unwired project would
 * boot a daemon that silently does nothing — fail fast with a fixable message
 * instead.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

const NEXT_CONFIG_NAMES = ["next.config.ts", "next.config.mjs", "next.config.js"];
const LAYOUT_NAMES = ["layout.tsx", "layout.jsx", "layout.js"];
// Next.js App Router supports both `app/` at the project root and `src/app/`.
// Check both so projects using either convention work without configuration.
const APP_DIRS = ["app", "src/app"];

/** True if a `next.config` source configures the Specula SWC plugin. */
export function configHasPlugin(source) {
  return /swcPlugins/.test(source) && /specula/i.test(source);
}

/** True if a layout source loads the daemon's `/specula.js` overlay. */
export function layoutHasOverlay(source) {
  return /specula\.js/.test(source);
}

/** The project's `next.config` file, or `null` if there is none. */
export function findNextConfig(projectRoot) {
  for (const name of NEXT_CONFIG_NAMES) {
    const candidate = join(projectRoot, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** The App Router root layout (`app/layout.*` or `src/app/layout.*`), or `null`. */
export function findRootLayout(projectRoot) {
  for (const appDir of APP_DIRS) {
    for (const name of LAYOUT_NAMES) {
      const candidate = join(projectRoot, appDir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Inspect a project's Specula wiring. Returns `{ ok, problems }` — `problems`
 * is a list of human-readable, fixable issues, empty when `ok` is true.
 */
export function checkWiring(projectRoot) {
  const problems = [];

  const config = findNextConfig(projectRoot);
  if (!config) {
    problems.push(
      "no next.config.{ts,mjs,js} found — run `specula dev` from a Next.js project root",
    );
  } else if (!configHasPlugin(readFileSync(config, "utf8"))) {
    problems.push(
      `${basename(config)} does not configure the Specula SWC plugin (see the README)`,
    );
  }

  const layout = findRootLayout(projectRoot);
  if (!layout) {
    problems.push(
      "no app/layout.{tsx,jsx,js} or src/app/layout.{tsx,jsx,js} found — Specula v1 needs the Next.js App Router",
    );
  } else if (!layoutHasOverlay(readFileSync(layout, "utf8"))) {
    problems.push(
      `${relative(projectRoot, layout)} does not load the Specula overlay <script> (see the README)`,
    );
  }

  return { ok: problems.length === 0, problems };
}
