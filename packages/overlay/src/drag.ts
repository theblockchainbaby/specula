/**
 * Drag-to-reorder — pick up the selected element with the mouse and drop it on
 * an adjacent sibling to swap them. Maps to the existing `move` verb, so no
 * new daemon or Rust planner work is needed.
 *
 * v1 only swaps with immediate neighbors (previous or next sibling). Dragging
 * across non-adjacent positions is silently ignored — a more general "place
 * before / after target" move verb is wave 2.
 */

import { moveElement, type Intent, type Selection } from "./intent.js";

export interface DragDeps {
  /** The currently selected element, with its identity and DOM node. */
  getSelected: () => { element: Element; selection: Selection } | null;
  sendIntent: (intent: Intent) => void;
}

/** Walk up from `node` to find the closest instrumented ancestor (its
 *  `data-spc` is its structural identity). Duck-types via `hasAttribute`
 *  rather than `instanceof Element` so the function works in both the
 *  browser and JSDOM (where global `Element` isn't defined). */
function closestInstrumented(node: EventTarget | null): Element | null {
  let el = node as Element | null;
  while (el && typeof el.hasAttribute === "function") {
    if (el.hasAttribute("data-spc")) return el;
    el = el.parentElement;
  }
  return null;
}

/** True if `a` and `b` share a parent AND are immediate siblings. */
function adjacentSiblings(a: Element, b: Element): boolean {
  if (a === b) return false;
  if (a.parentElement !== b.parentElement) return false;
  return a.nextElementSibling === b || a.previousElementSibling === b;
}

export function installDragReorder(
  document: Document,
  deps: DragDeps,
): void {
  // The element being dragged in the current gesture. Cleared on drop or end.
  let dragged: { element: Element; selection: Selection } | null = null;

  document.addEventListener("dragstart", (event) => {
    const selected = deps.getSelected();
    if (!selected) return;
    const target = closestInstrumented(event.target);
    if (target !== selected.element) return;
    dragged = selected;
    // Allow the move (visual cursor) — without dataTransfer setData calls,
    // some browsers cancel drag. The dataTransfer may be missing in JSDOM
    // tests so we guard the access.
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", selected.selection.path);
      } catch {
        // Some hosts (e.g. JSDOM) throw on setData. Safe to ignore.
      }
    }
  });

  document.addEventListener("dragover", (event) => {
    if (!dragged) return;
    const target = closestInstrumented(event.target);
    if (!target || !adjacentSiblings(dragged.element, target)) return;
    event.preventDefault(); // signal that a drop is welcome here
  });

  document.addEventListener("drop", (event) => {
    if (!dragged) return;
    const target = closestInstrumented(event.target);
    if (!target) {
      dragged = null;
      return;
    }
    if (!adjacentSiblings(dragged.element, target)) {
      dragged = null;
      return;
    }
    const siblingPath = target.getAttribute("data-spc");
    if (!siblingPath) {
      dragged = null;
      return;
    }
    event.preventDefault();
    deps.sendIntent(
      moveElement(dragged.selection, { path: siblingPath, instanceIndex: 0 }),
    );
    dragged = null;
  });

  document.addEventListener("dragend", () => {
    dragged = null;
  });
}
