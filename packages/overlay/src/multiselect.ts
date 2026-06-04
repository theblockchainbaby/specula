/**
 * Multi-selection state machine — hold Cmd/Ctrl while clicking instrumented
 * elements to grow a set of selections, all of which receive the next class
 * operation (set-class) applied to any one of them.
 *
 * Pure state container. Subscribers are notified on every change. The DOM
 * chrome and inspector integration live elsewhere (chrome.ts emits a box per
 * selection; index.ts wires the click handler).
 *
 * v1 scope: class operations only. Text edits and structural verbs remain
 * single-selection (they're not meaningful applied to N elements at once).
 */

import type { Selection } from "./intent.js";

/** A composite key uniquely identifying a selection. */
function key(s: Selection): string {
  return `${s.path}#${s.instanceIndex}`;
}

export class MultiSelection {
  // Insertion-ordered map of structural key → Selection.
  #items = new Map<string, Selection>();
  #listeners = new Set<() => void>();

  get size(): number {
    return this.#items.size;
  }

  has(s: Selection): boolean {
    return this.#items.has(key(s));
  }

  list(): Selection[] {
    return Array.from(this.#items.values());
  }

  /** Add a selection if absent. No-op (and no notification) if already present. */
  add(s: Selection): void {
    const k = key(s);
    if (this.#items.has(k)) return;
    this.#items.set(k, s);
    this.#notify();
  }

  /** Toggle membership — adds if absent, removes if present. */
  toggle(s: Selection): void {
    const k = key(s);
    if (this.#items.has(k)) {
      this.#items.delete(k);
    } else {
      this.#items.set(k, s);
    }
    this.#notify();
  }

  /** Empty the set. */
  clear(): void {
    if (this.#items.size === 0) return;
    this.#items.clear();
    this.#notify();
  }

  /** Replace the entire set with a single selection (e.g. a non-modifier click). */
  setOne(s: Selection): void {
    this.#items.clear();
    this.#items.set(key(s), s);
    this.#notify();
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #notify(): void {
    for (const fn of this.#listeners) fn();
  }
}
