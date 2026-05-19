/**
 * Tailwind class arithmetic for the `set-class` verb.
 *
 * `tailwind-merge` is run on every result so conflicting utilities resolve
 * last-wins (`p-4 p-6` → `p-6`) — `specs/protocol.md` makes this the daemon's
 * job, not the overlay's.
 */

import { twMerge } from "tailwind-merge";
import type { StyleState } from "./protocol.js";

/** The Tailwind variant prefix for a style state, e.g. `dark:md:hover:`. */
export function statePrefix(state: StyleState): string {
  const parts: string[] = [];
  if (state.scheme === "dark") parts.push("dark");
  if (state.breakpoint) parts.push(state.breakpoint);
  if (state.variant) parts.push(state.variant);
  return parts.length > 0 ? `${parts.join(":")}:` : "";
}

/**
 * Compute the new className: drop the `remove` classes, add the `add` classes
 * (prefixed for the style state), and normalize with tailwind-merge.
 */
export function computeClassName(
  current: string,
  state: StyleState,
  add: string[],
  remove: string[],
): string {
  const removed = new Set(remove);
  const kept = current.split(/\s+/).filter((cls) => cls && !removed.has(cls));
  const prefix = statePrefix(state);
  const added = add.map((cls) => prefix + cls);
  return twMerge([...kept, ...added].join(" "));
}
