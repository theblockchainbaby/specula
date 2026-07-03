// Screenshot capture — the real overlay, in a real browser, for the README.
//
// Reuses the dev-verify harness: starts the Specula daemon and the playground's
// `next dev`, opens the page in Chromium, clicks the heading so the selection
// chrome + inspector HUD render, and saves a retina screenshot. Makes no source
// edits — it only selects, so there is nothing to restore.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
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
const outFile = resolve(repoRoot, "docs/specula-screenshot.png");

const DAEMON_PORT = 5151;
const DEV_PORT = 3221;
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
  const page = await browser.newPage({
    viewport: { width: 1024, height: 576 },
    deviceScaleFactor: 2,
  });
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });

  // Hide Next.js's own dev indicator — it isn't part of Specula.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  // The overlay auto-injects: the playground's <script> loads /specula.js.
  await page.waitForFunction(() => "__specula" in window, { timeout: 30000 });

  // Click the heading — draws the selection chrome and opens the inspector.
  await page.click("h1");
  await page.waitForSelector("#specula-selection-box", {
    state: "visible",
    timeout: 5000,
  });
  await page.waitForSelector('#specula-inspector input[data-specula-field="text"]', {
    state: "visible",
    timeout: 15000,
  });

  // Park the cursor off-canvas so no hover-preview box bleeds into the shot,
  // and let the connection chip settle to its connected state.
  await page.mouse.move(0, 0);
  await sleep(800);

  mkdirSync(dirname(outFile), { recursive: true });
  await page.screenshot({ path: outFile });
  console.log(`PASS — wrote ${outFile}`);
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
}
