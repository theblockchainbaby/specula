/**
 * The optimistic tracker — the overlay side of the Tier-A correction loop.
 *
 * On `intent-ack` it patches the DOM and remembers how to undo it; on
 * `intent-committed` it confirms (and reports what the DOM shows, for a
 * `reconcile-observe`); on `intent-failed` it reverts.
 */

import { applyMutation, observe, revertMutation } from "./patch.js";
import type { DomMutation, MutationSnapshot } from "./patch.js";

/** Tracks optimistic patches awaiting the daemon's verdict, keyed by `txId`. */
export class OptimisticTracker {
  readonly #pending = new Map<string, MutationSnapshot>();
  readonly #root: ParentNode;

  constructor(root: ParentNode) {
    this.#root = root;
  }

  /** `intent-ack` — apply the optimistic patch to the DOM immediately. */
  ack(txId: string, mutation: DomMutation): void {
    const snapshot = applyMutation(this.#root, mutation);
    if (snapshot) this.#pending.set(txId, snapshot);
  }

  /**
   * `intent-committed` — the daemon agreed; drop the snapshot and return what
   * the DOM now shows, so the caller can send a `reconcile-observe`.
   */
  commit(txId: string): DomMutation | null {
    const snapshot = this.#pending.get(txId);
    this.#pending.delete(txId);
    return snapshot ? observe(this.#root, snapshot.mutation) : null;
  }

  /** `intent-failed` — revert the optimistic patch. */
  fail(txId: string): void {
    const snapshot = this.#pending.get(txId);
    if (snapshot) {
      revertMutation(this.#root, snapshot);
      this.#pending.delete(txId);
    }
  }

  /** How many optimistic patches are still awaiting a verdict. */
  get pendingCount(): number {
    return this.#pending.size;
  }
}

/**
 * Route a daemon message to the tracker. After a commit, `sendReconcile` is
 * called with the observed state for a `reconcile-observe` message. Pure — it
 * takes plain data, so it is unit-testable without a socket.
 */
export function routeServerMessage(
  tracker: OptimisticTracker,
  message: unknown,
  sendReconcile: (txId: string, observed: DomMutation) => void,
): void {
  if (typeof message !== "object" || message === null) return;
  const m = message as {
    type?: unknown;
    txId?: unknown;
    optimistic?: unknown;
  };
  if (typeof m.txId !== "string") return;

  if (m.type === "intent-ack" && m.optimistic) {
    tracker.ack(m.txId, m.optimistic as DomMutation);
  } else if (m.type === "intent-committed") {
    const observed = tracker.commit(m.txId);
    if (observed) sendReconcile(m.txId, observed);
  } else if (m.type === "intent-failed") {
    tracker.fail(m.txId);
  }
}
