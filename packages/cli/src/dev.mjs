/**
 * `specula dev` — the developer entry point.
 *
 * Starts the Specula daemon and the project's `next dev` together, wired so
 * the overlay auto-injects: one daemon port, chosen once, reaches both the
 * daemon (which binds it) and the dev server (whose layout `<script>` reads
 * it through `SPECULA_PORT`). Ctrl-C tears both down.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { checkWiring } from "./wiring.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// packages/cli/src -> the repo root.
const repoRoot = resolve(here, "../../..");

/** The built artifacts `specula dev` needs — produced by `npm run setup`. */
const ARTIFACTS = {
  "specula-analyze binary": join(
    repoRoot,
    "specula-instrument/target/release/specula-analyze",
  ),
  "specula-edit binary": join(
    repoRoot,
    "specula-instrument/target/release/specula-edit",
  ),
  "SWC plugin wasm": join(
    repoRoot,
    "specula-instrument/target/wasm32-wasip1/release/specula_swc_plugin.wasm",
  ),
  "overlay bundle": join(repoRoot, "packages/overlay/dist/overlay.js"),
};
const daemonDir = join(repoRoot, "packages/daemon");

/** Listen on `port` (0 = any); resolve the bound port, or null if taken. */
function tryListen(port) {
  return new Promise((resolvePort) => {
    const probe = createServer();
    probe.once("error", () => resolvePort(null));
    probe.listen(port, "127.0.0.1", () => {
      const bound = probe.address().port;
      probe.close(() => resolvePort(bound));
    });
  });
}

/** A free loopback port — `preferred` if available, else any free port. */
async function freePort(preferred) {
  return (await tryListen(preferred)) ?? (await tryListen(0));
}

/** Resolve once `url` answers 2xx, or throw after `timeoutMs`. */
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${url}`);
}

/**
 * Resolve the project's `next` entry script through the project's own module
 * resolution, so it is found whether `next` is installed in the project or
 * hoisted to a workspace root. Returns the script path, or `null`.
 */
function resolveNextBin(projectRoot) {
  try {
    const projectRequire = createRequire(join(projectRoot, "package.json"));
    const pkgPath = projectRequire.resolve("next/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const binField = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.next;
    return binField ? join(dirname(pkgPath), binField) : null;
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`specula: ${message}`);
  process.exit(1);
}

/**
 * Run the `dev` command. `argv` is the arguments after `dev`; the first
 * non-flag argument is the project root (defaults to the current directory).
 */
export async function dev(argv) {
  const positional = argv.find((arg) => !arg.startsWith("-"));
  const projectRoot = resolve(process.cwd(), positional ?? ".");

  // Preflight 1 — the built artifacts exist.
  for (const [name, path] of Object.entries(ARTIFACTS)) {
    if (!existsSync(path)) {
      fail(
        `missing ${name}.\n` +
          "  Build Specula first: run `npm run setup` in the Specula repo.",
      );
    }
  }

  // Preflight 2 — the project is wired for Specula.
  const wiring = checkWiring(projectRoot);
  if (!wiring.ok) {
    console.error(`specula: ${projectRoot} is not wired for Specula —`);
    for (const problem of wiring.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  // Preflight 3 — the project's `next` is installed (locally or hoisted).
  const nextBin = resolveNextBin(projectRoot);
  if (!nextBin) {
    fail(
      "could not resolve `next` from the project.\n" +
        "  Install the project's dependencies first.",
    );
  }

  // One port, given to both children: the daemon binds it, and the dev
  // server's layout reads it through SPECULA_PORT to address the overlay.
  const daemonPort = await freePort(Number(process.env.SPECULA_PORT) || 5151);
  const devPort = await freePort(3000);
  const origin = `http://localhost:${devPort}`;

  const childEnv = {
    ...process.env,
    SPECULA_PORT: String(daemonPort),
    SPECULA_DEV_ORIGIN: origin,
    SPECULA_ANALYZE_BIN: ARTIFACTS["specula-analyze binary"],
    SPECULA_EDIT_BIN: ARTIFACTS["specula-edit binary"],
    SPECULA_OVERLAY_BUNDLE: ARTIFACTS["overlay bundle"],
  };

  console.log(`specula: starting the daemon on port ${daemonPort}…`);
  const daemon = spawn("node", ["--import", "tsx", "src/cli.ts", projectRoot], {
    cwd: daemonDir,
    detached: true,
    stdio: "inherit",
    env: childEnv,
  });

  console.log(`specula: starting next dev on ${origin}…`);
  const next = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "-p", String(devPort)],
    { cwd: projectRoot, detached: true, stdio: "inherit", env: childEnv },
  );

  // Shutdown — kill each child's whole process group (next spawns workers).
  const children = [daemon, next];
  let shuttingDown = false;
  function shutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    }
    process.exit(code);
  }

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  for (const child of children) {
    child.on("error", (error) => {
      if (!shuttingDown) {
        console.error(`specula: failed to start a process — ${error.message}`);
        shutdown(1);
      }
    });
    child.on("exit", () => {
      if (!shuttingDown) {
        console.error("specula: a child process exited — shutting down.");
        shutdown(1);
      }
    });
  }

  try {
    await waitForServer(`http://127.0.0.1:${daemonPort}/specula.js`, 40000);
    await waitForServer(origin, 180000);
  } catch (error) {
    console.error(`specula: ${error.message}`);
    shutdown(1);
    return;
  }

  console.log(
    `\nspecula: ready — open ${origin}\n` +
      "  Click an element to select it, then edit its text, classes, styles,\n" +
      "  or assets in the inspector. Every edit is written to source.\n" +
      "  Ctrl-C to stop.\n",
  );
}
