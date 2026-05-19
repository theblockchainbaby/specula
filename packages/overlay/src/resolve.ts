/**
 * Resolving DOM clicks to Specula identities.
 *
 * The overlay hit-tests through the DOM via `data-spc` attributes; the daemon's
 * map is the authoritative model (`specs/identity.md`). These functions are
 * pure — they take an `Element` and use only standard DOM APIs — so they run
 * unchanged in the browser and under jsdom in tests.
 */

/** An instrumented element resolved from the DOM. */
export interface Resolved {
  element: Element;
  /** Structural path identity — `specs/identity.md`. */
  path: string;
  /** `server` | `client`, from `data-spc-env`. */
  env: string;
  /** Which DOM instance of this path — 0 unless the path is `.map()`ed. */
  instanceIndex: number;
}

function describe(element: Element, root: ParentNode): Resolved {
  const path = element.getAttribute("data-spc") ?? "";
  const env = element.getAttribute("data-spc-env") ?? "server";
  // A `.map()`ed source element renders N DOM nodes sharing one `data-spc`;
  // the instance index says which one this is.
  const instances = [...root.querySelectorAll(`[data-spc="${path}"]`)];
  const index = instances.indexOf(element);
  return { element, path, env, instanceIndex: index < 0 ? 0 : index };
}

/**
 * From a clicked element, find the nearest instrumented element (self or
 * ancestor). Returns `null` if the click was outside any instrumented subtree.
 */
export function hitTest(
  target: Element,
  root: ParentNode = target.ownerDocument ?? target,
): Resolved | null {
  const element = target.closest("[data-spc]");
  return element ? describe(element, root) : null;
}

/**
 * The selection ladder: the instrumented element under `target`, then each
 * instrumented ancestor, outermost last. It walks the DOM, so it naturally
 * crosses component and file boundaries — each rung may belong to a different
 * source file.
 */
export function ladder(
  target: Element,
  root: ParentNode = target.ownerDocument ?? target,
): Resolved[] {
  const rungs: Resolved[] = [];
  let current = target.closest("[data-spc]");
  while (current) {
    rungs.push(describe(current, root));
    const parent = current.parentElement;
    current = parent ? parent.closest("[data-spc]") : null;
  }
  return rungs;
}
