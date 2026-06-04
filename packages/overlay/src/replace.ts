/**
 * Bulk text replacement — find a literal string within the selected
 * subtree's instrumented text-leaf descendants, replace it everywhere, and
 * fire one `edit-text` verb per matching element so source diffs stay
 * minimal and reviewable per-leaf.
 *
 * Lowers entirely to the existing `edit-text` verb — no new daemon or Rust
 * planner. The "verb" here is a multi-shot bulk operation built in the
 * overlay layer on top of the single-shot underlying primitive.
 *
 * v1 scope:
 * - Literal string match (regex metacharacters are escaped, not interpreted).
 * - Case sensitive.
 * - Only finds elements whose direct text (excluding child elements) contains
 *   the find string. Wrapping elements like `<main>` are not matched.
 */

import type { Selection } from "./intent.js";

export interface TextTarget {
  element: Element;
  selection: Selection;
  currentText: string;
}

/** Walk `root`'s instrumented descendants, returning every leaf whose own
 *  text (the join of its direct text-node children, excluding any nested
 *  elements' text) contains `find`. */
export function collectTextTargets(root: Element, find: string): TextTarget[] {
  if (!find) return [];
  const out: TextTarget[] = [];
  const walker = (root.ownerDocument || document).createTreeWalker(
    root,
    1 /* SHOW_ELEMENT */,
  );
  let node: Node | null = walker.currentNode;
  while (node) {
    const el = node as Element;
    if (
      typeof el.hasAttribute === "function" &&
      el.hasAttribute("data-spc")
    ) {
      const direct = directText(el);
      if (direct.includes(find)) {
        const path = el.getAttribute("data-spc");
        if (path) {
          out.push({
            element: el,
            selection: { path, instanceIndex: 0 },
            currentText: direct,
          });
        }
      }
    }
    node = walker.nextNode();
  }
  return out;
}

/** The join of `el`'s direct text-node children, without any nested element
 *  text. Mirrors how Specula treats a text-leaf element. */
function directText(el: Element): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      out += child.textContent || "";
    }
  }
  return out;
}

/** Replace every literal occurrence of `find` with `replace` in `text`. */
export function applyReplacement(
  text: string,
  find: string,
  replace: string,
): string {
  if (!find) return text;
  // Escape regex metacharacters so the user's literal string matches literally.
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "g"), replace);
}
