// Browser verification — drives a real Chromium browser to confirm the overlay
// works against the playground: builds the playground, serves it, injects the
// bundled overlay, clicks the heading, and asserts selection chrome is drawn
// over it. This is the check jsdom cannot give — real layout, real events.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { resolveNextBin } from "./next-bin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const playground = resolve(here, "../../apps/playground");
const overlayBundle = resolve(here, "dist/overlay.js");
const nextBin = resolveNextBin(playground);
const PORT = 3219;
const BASE = `http://127.0.0.1:${PORT}/`;

function run(command, args, options) {
  return new Promise((res, rej) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`${command} exited with ${code}`)),
    );
    child.on("error", rej);
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`server never became ready: ${url}`);
}

let server;
let browser;
try {
  console.log("· building the playground…");
  await run("npm", ["run", "build", "--prefix", playground]);
  if (!existsSync(overlayBundle)) {
    throw new Error("overlay bundle missing — run `npm run build` first");
  }

  console.log(`· starting next on ${PORT}…`);
  server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: playground,
    stdio: "ignore",
    detached: true,
  });
  await waitForServer(BASE, 90000);

  console.log("· launching chromium…");
  browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleLog = [];
  page.on("console", (m) => consoleLog.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => consoleLog.push(`pageerror: ${e.message}`));

  const response = await page.goto(BASE, { waitUntil: "domcontentloaded" });
  if (!response || !response.ok()) {
    throw new Error(`page.goto returned status ${response?.status()}`);
  }

  try {
    await page.waitForSelector("h1", { state: "attached", timeout: 15000 });
  } catch {
    const html = (await page.content()).slice(0, 600);
    throw new Error(`no <h1> in the page.\n  console: ${consoleLog.join(" | ")}\n  html: ${html}`);
  }

  // The page is real SWC-plugin output — confirm the heading is instrumented.
  const h1Spc = await page.getAttribute("h1", "data-spc");
  if (!h1Spc || !/page\.tsx#Home\/main:0\/h1:0$/.test(h1Spc)) {
    throw new Error(`unexpected h1 data-spc: ${h1Spc}`);
  }

  // Inject the bundled overlay and start it. The daemon is not needed for
  // click → chrome; an unreachable URL fails silently in the browser.
  await page.addScriptTag({ path: overlayBundle });
  await page.evaluate(() => {
    window.SpeculaOverlay.startOverlay({
      daemonUrl: "ws://127.0.0.1:65535",
      token: "browser-verify",
    });
  });

  // Click the heading — the overlay should hit-test it and draw chrome.
  await page.click("h1");
  await page.waitForSelector("#specula-selection-box", {
    state: "visible",
    timeout: 5000,
  });

  const boxRect = await page.locator("#specula-selection-box").boundingBox();
  const h1Rect = await page.locator("h1").boundingBox();
  if (!boxRect || !h1Rect) throw new Error("could not measure the box or the h1");

  const drift =
    Math.abs(boxRect.x - h1Rect.x) +
    Math.abs(boxRect.y - h1Rect.y) +
    Math.abs(boxRect.width - h1Rect.width) +
    Math.abs(boxRect.height - h1Rect.height);
  if (drift > 4) {
    throw new Error(`selection box is not aligned to the h1 (drift ${drift}px)`);
  }

  console.log(
    `PASS — overlay hit-tested ${h1Spc} and drew chrome over it (drift ${drift.toFixed(1)}px)`,
  );
} finally {
  if (browser) await browser.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}
