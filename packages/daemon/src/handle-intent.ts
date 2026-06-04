/**
 * Routing an `intent` through the lifecycle — `specs/protocol.md`.
 *
 * Tier-A property edits (`edit-text`, `set-class`, `replace-asset`) ack with an
 * optimistic DOM mutation so the overlay can patch the page instantly. Tier-B
 * structural edits (`delete`, `duplicate`, `wrap`, `move`) ack without one —
 * Fast Refresh re-renders them fast enough. Either way the real edit runs as a
 * transaction and reports `intent-committed` / `intent-failed`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { runEdit } from "./apply-edit.js";
import type { EditOptions } from "./apply-edit.js";
import { computeClassName } from "./class-merge.js";
import type { EditVerb } from "./edit.js";
import type {
  DomMutation,
  Intent,
  IntentAck,
  IntentFailed,
  ReconcileObserve,
  ReplaceAssetIntent,
} from "./protocol.js";
import { reconcileMatches } from "./reconcile.js";
import { send } from "./server.js";
import { analyzeFile } from "./source-map.js";
import type { SourceMap } from "./source-map.js";

/**
 * Per-intent options. Identical to [`EditOptions`] — every intent runs as an
 * edit transaction, and `projectRoot` (on `EditOptions`) is what both path
 * resolution and `replace-asset` uploads need.
 */
export type IntentOptions = EditOptions;

/** Per-transaction record of the optimistic mutation, for reconcile checks. */
export type IntentLog = Map<string, DomMutation>;

/**
 * Handle an `intent`: ack (optimistically for Tier A), run the transaction,
 * and reply `intent-committed` or `intent-failed`.
 */
export async function handleIntent(
  socket: WebSocket,
  intent: Intent,
  map: SourceMap,
  options: IntentOptions,
  log: IntentLog,
): Promise<void> {
  const txId = intent.id;
  const entry = map.resolve(intent.selection.path);
  if (!entry) {
    fail(socket, intent.id, txId, "stale", `unknown path: ${intent.selection.path}`);
    return;
  }

  const { path, instanceIndex } = intent.selection;
  let verb: EditVerb;
  let value: string;
  let mutation: DomMutation | undefined;

  switch (intent.verb) {
    case "edit-text":
      verb = "edit-text";
      value = intent.text;
      mutation = { kind: "text", path, instanceIndex, text: value };
      break;
    case "set-class":
      verb = "set-class";
      value = computeClassName(
        entry.className ?? "",
        intent.state,
        intent.add ?? [],
        intent.remove ?? [],
      );
      mutation = { kind: "class", path, instanceIndex, className: value };
      break;
    case "replace-asset":
      verb = "replace-asset";
      value = await resolveAssetSrc(intent.asset, options.projectRoot);
      mutation = { kind: "attr", path, instanceIndex, name: "src", value };
      break;
    case "delete":
      verb = "delete";
      value = "";
      break;
    case "duplicate":
      verb = "duplicate";
      value = "";
      break;
    case "wrap":
      verb = "wrap";
      value = intent.tag;
      break;
    case "unwrap":
      verb = "unwrap";
      value = "";
      break;
    case "toggle-conditional":
      verb = "toggle-conditional";
      value = "";
      break;
    case "set-prop":
      verb = "set-prop";
      value = intent.value;
      break;
    case "move":
      verb = "move";
      value = intent.sibling.path;
      break;
    case "set-style": {
      // `set-style` lowers to `set-class`: a Tailwind arbitrary-property class
      // (`[padding:16px]`). Spaces in the value become `_`, per Tailwind.
      verb = "set-class";
      const styleClass = `[${intent.property}:${intent.value.replace(/ /g, "_")}]`;
      value = computeClassName(entry.className ?? "", intent.state, [styleClass], []);
      mutation = { kind: "class", path, instanceIndex, className: value };
      break;
    }
    default:
      // Unreachable — every Intent verb is handled above. `txId` is `intent.id`.
      fail(socket, txId, txId, "internal", "unsupported intent verb");
      return;
  }

  // Tier A acks with an optimistic mutation; Tier B (structural) does not.
  const ack: IntentAck = {
    v: 1,
    id: intent.id,
    type: "intent-ack",
    txId,
    tier: mutation ? "A" : "B",
    blastRadius: {
      domInstances: 1,
      sourceFiles: [entry.file],
      affectedPaths: [path],
    },
  };
  if (mutation) {
    ack.optimistic = mutation;
    log.set(txId, mutation);
  }
  send(socket, ack);

  const attr = intent.verb === "set-prop" ? intent.attr : undefined;
  const result = await runEdit(entry.file, verb, path, value, options, attr);
  if (result.ok) {
    // The file changed — refresh its slice of the source map so later
    // selections and edits resolve against current paths.
    try {
      const refreshed = await analyzeFile(
        options.analyzeBin,
        entry.file,
        await readFile(join(options.projectRoot, entry.file), "utf8"),
      );
      map.add(refreshed);
    } catch {
      /* a transient read/parse failure — leave the map as-is */
    }
    send(socket, {
      v: 1,
      id: intent.id,
      type: "intent-committed",
      txId,
      rekey: [],
      diff: [],
    });
  } else {
    log.delete(txId);
    fail(socket, intent.id, txId, "internal", result.reason ?? "edit failed");
  }
}

/**
 * Handle a `reconcile-observe`: compare what the overlay saw after the
 * re-render against the recorded optimistic mutation, and warn on divergence.
 */
export function handleReconcileObserve(
  socket: WebSocket,
  message: ReconcileObserve,
  log: IntentLog,
): void {
  const intended = log.get(message.txId);
  if (!intended) return;
  log.delete(message.txId);

  if (!reconcileMatches(intended, message.observed)) {
    send(socket, {
      v: 1,
      id: message.id,
      type: "intent-warning",
      txId: message.txId,
      reason: "reconcile-divergence",
      detail: "the rendered result differs from the optimistic preview",
    });
  }
}

/** Resolve a `replace-asset` payload to a `src` value, writing uploads. */
async function resolveAssetSrc(
  asset: ReplaceAssetIntent["asset"],
  projectRoot: string,
): Promise<string> {
  if ("url" in asset) return asset.url;
  const dir = join(projectRoot, "public");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, asset.name),
    Buffer.from(asset.dataBase64, "base64"),
  );
  return `/${asset.name}`;
}

function fail(
  socket: WebSocket,
  id: string,
  txId: string,
  reason: IntentFailed["reason"],
  detail: string,
): void {
  send(socket, {
    v: 1,
    id,
    type: "intent-failed",
    txId,
    reason,
    detail,
    revertOptimistic: true,
  });
}
