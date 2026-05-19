/**
 * Daemon entry point — analyzes the project, boots a session, starts the
 * WebSocket server, and routes `select` and `intent` messages.
 */

import { resolve } from "node:path";
import { FileQueue } from "./file-queue.js";
import { handleIntent, handleReconcileObserve } from "./handle-intent.js";
import type { IntentLog } from "./handle-intent.js";
import { analyzeProject } from "./project.js";
import { handleSelect } from "./select.js";
import { send, startDaemon } from "./server.js";
import type { DaemonHandle } from "./server.js";
import { generateToken, persistSession } from "./session.js";
import type { SourceMap } from "./source-map.js";

export interface StartOptions {
  /** TCP port; 0 picks a free one. */
  port?: number;
  /** The dev server's origin, e.g. `http://localhost:3000`. */
  devOrigin: string;
  /** Path to the `specula-analyze` binary. */
  analyzeBin: string;
  /** Path to the `specula-edit` binary. */
  editBin: string;
  /** Path to the bundled overlay; enables serving `GET /specula.js`. */
  overlayBundle?: string;
}

export interface SpeculaDaemon extends DaemonHandle {
  token: string;
  sourceMap: SourceMap;
}

/**
 * Start the Specula daemon for a project: analyze its files into a source map,
 * mint a session token, start the server, and route `select` / `intent`.
 */
export async function startSpeculaDaemon(
  projectRoot: string,
  options: StartOptions,
): Promise<SpeculaDaemon> {
  // Normalize to one canonical absolute root. Element identity is relative to
  // it; all disk I/O resolves against it. Everything downstream assumes this.
  projectRoot = resolve(projectRoot);
  const token = generateToken();
  const { map } = await analyzeProject(options.analyzeBin, projectRoot);
  const intentOptions = {
    editBin: options.editBin,
    analyzeBin: options.analyzeBin,
    queue: new FileQueue(),
    projectRoot,
  };
  // Records each transaction's optimistic mutation for the reconcile check.
  const log: IntentLog = new Map();

  const handle = await startDaemon({
    port: options.port ?? 0,
    token,
    allowedOrigins: [options.devOrigin],
    project: { framework: "next", styleSystem: "tailwind", root: projectRoot },
    overlayBundle: options.overlayBundle,
    onMessage: (socket, message) => {
      if (message.type === "select") {
        const reply = handleSelect(map, message);
        if (reply) send(socket, reply);
      } else if (message.type === "intent") {
        void handleIntent(socket, message, map, intentOptions, log);
      } else if (message.type === "reconcile-observe") {
        handleReconcileObserve(socket, message, log);
      }
    },
  });

  persistSession(projectRoot, token, handle.port);
  return { ...handle, token, sourceMap: map };
}

export { startDaemon, send } from "./server.js";
export { runTransaction } from "./transaction.js";
export { runEdit } from "./apply-edit.js";
export { applyEdit } from "./edit.js";
export { computeClassName } from "./class-merge.js";
export { handleIntent, handleReconcileObserve } from "./handle-intent.js";
export { analyzeProject } from "./project.js";
export { discoverSourceFiles } from "./discover.js";
export { handleSelect } from "./select.js";
export { SourceMap, analyzeFile } from "./source-map.js";
export * from "./protocol.js";
