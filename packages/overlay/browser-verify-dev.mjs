// Dev-server verification — the full loop in a real browser.
//
// Starts the Specula daemon and the playground's `next dev`, opens the page in
// Chromium, and confirms: the overlay auto-injects (the daemon serves it, the
// playground's <script> loads it), a click selects, and an `edit-text` intent
// optimistically patches the DOM *and* commits to source.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { resolveNextBin } from "./next-bin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const playground = resolve(repoRoot, "apps/playground");
const daemonDir = resolve(repoRoot, "packages/daemon");
const binDir = resolve(repoRoot, "specula-instrument/target/release");
const overlayBundle = resolve(here, "dist/overlay.js");
const pageFile = join(playground, "app", "page.tsx");

const DAEMON_PORT = 5151;
const DEV_PORT = 3220;
const ORIGIN = `http://localhost:${DEV_PORT}`;

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
    } catch {
      /* not ready */
    }
    await sleep(500);
  }
  throw new Error(`server never became ready: ${url}`);
}

// --- preflight -------------------------------------------------------------
for (const bin of ["specula-analyze", "specula-edit"]) {
  if (!existsSync(join(binDir, bin))) {
    throw new Error(`missing ${bin} — run \`cargo build --release\` first`);
  }
}
if (!existsSync(overlayBundle)) {
  throw new Error("missing dist/overlay.js — run `npm run build` first");
}

let daemon;
let next;
let browser;
const originalPage = readFileSync(pageFile, "utf8");

try {
  console.log("· starting the specula daemon…");
  daemon = spawn("node", ["--import", "tsx", "src/cli.ts", playground], {
    cwd: daemonDir,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      SPECULA_PORT: String(DAEMON_PORT),
      SPECULA_DEV_ORIGIN: ORIGIN,
      SPECULA_ANALYZE_BIN: join(binDir, "specula-analyze"),
      SPECULA_EDIT_BIN: join(binDir, "specula-edit"),
      SPECULA_OVERLAY_BUNDLE: overlayBundle,
    },
  });
  await waitForServer(`http://127.0.0.1:${DAEMON_PORT}/specula.js`, 40000);

  console.log("· starting next dev…");
  next = spawn(
    process.execPath,
    [resolveNextBin(playground), "dev", "--webpack", "-p", String(DEV_PORT)],
    { cwd: playground, detached: true, stdio: "ignore" },
  );
  await waitForServer(ORIGIN, 150000);

  console.log("· launching chromium…");
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });

  // The overlay auto-injects: the playground's <script> loads /specula.js from
  // the daemon, whose bootstrap calls startOverlay and sets window.__specula.
  await page.waitForFunction(() => "__specula" in window, { timeout: 30000 });

  // A click selects — chrome is drawn and the inspector panel opens.
  await page.click("h1");
  await page.waitForSelector("#specula-selection-box", {
    state: "visible",
    timeout: 5000,
  });
  await page.waitForSelector("[data-specula-rung]", {
    state: "visible",
    timeout: 15000,
  });

  // Selection ladder: click the <main> rung — the selection climbs to <main>.
  await page.click('[data-specula-rung$="#Home/main:0"]');
  await page.waitForFunction(
    () => {
      const box = document
        .querySelector("#specula-selection-box")
        ?.getBoundingClientRect();
      const main = document.querySelector("main")?.getBoundingClientRect();
      return (
        !!box &&
        !!main &&
        Math.abs(box.width - main.width) < 2 &&
        Math.abs(box.height - main.height) < 2
      );
    },
    { timeout: 5000 },
  );

  // Re-select the heading and edit its text through the inspector — the
  // genuine click → edit gesture, no programmatic intent.
  await page.click("h1");
  const textField = '#specula-inspector input[data-specula-field="text"]';
  await page.waitForSelector(textField, { state: "visible", timeout: 15000 });
  await page.fill(textField, "Edited live by Specula");
  await page.press(textField, "Enter");

  // The optimistic patch updates the heading the instant intent-ack arrives.
  await page.waitForFunction(
    () => document.querySelector("h1")?.textContent === "Edited live by Specula",
    { timeout: 15000 },
  );

  // The daemon committed the real edit — as a minimal diff: only the heading
  // text changes, every other byte of page.tsx is preserved.
  const expected = originalPage.replace(
    "Specula playground",
    "Edited live by Specula",
  );
  let committed = false;
  for (let i = 0; i < 60 && !committed; i++) {
    committed = readFileSync(pageFile, "utf8") === expected;
    if (!committed) await sleep(250);
  }
  if (!committed) {
    throw new Error("the edit was not committed as a minimal diff to page.tsx");
  }

  console.log(
    "PASS — overlay auto-injected; selection ladder climbed to <main>; an inspector edit optimistically patched the DOM and committed to source",
  );
} finally {
  if (browser) await browser.close();
  for (const proc of [next, daemon]) {
    if (proc?.pid) {
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
  // Restore the playground to its committed state.
  writeFileSync(pageFile, originalPage, "utf8");
  rmSync(join(playground, ".specula"), { recursive: true, force: true });
}
