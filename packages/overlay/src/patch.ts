/**
 * Optimistic DOM patching — the Tier-A latency mechanism (`specs/verification.md`).
 *
 * On `intent-ack` the overlay applies the daemon's `DomMutation` to the live
 * DOM immediately, so the edit feels instant; the real source edit reconciles
 * behind it. These functions are pure DOM operations — browser and jsdom alike.
 */

/** A DOM mutation the daemon describes — mirrors the daemon's `DomMutation`. */
export type DomMutation =
  | { kind: "text"; path: string; instanceIndex: number; text: string }
  | { kind: "class"; path: string; instanceIndex: number; className: string }
  | {
      kind: "attr";
      path: string;
      instanceIndex: number;
      name: string;
      value: string;
    };

/** An element's prior state, kept so an optimistic patch can be reverted. */
export interface MutationSnapshot {
  mutation: DomMutation;
  prior: string;
}

/** The element a mutation targets — the Nth DOM node carrying its `data-spc`. */
export function findInstance(
  root: ParentNode,
  path: string,
  instanceIndex: number,
): Element | null {
  const nodes = [...root.querySelectorAll(`[data-spc="${path}"]`)];
  return nodes[instanceIndex] ?? nodes[0] ?? null;
}

/**
 * Apply a mutation to the live DOM, returning a snapshot for revert — or
 * `null` if the target element is not present.
 */
export function applyMutation(
  root: ParentNode,
  mutation: DomMutation,
): MutationSnapshot | null {
  const element = findInstance(root, mutation.path, mutation.instanceIndex);
  if (!element) return null;
  const prior = readValue(element, mutation);
  writeValue(element, mutation);
  return { mutation, prior };
}

/** Revert a previously applied optimistic patch. */
export function revertMutation(root: ParentNode, snapshot: MutationSnapshot): void {
  const element = findInstance(
    root,
    snapshot.mutation.path,
    snapshot.mutation.instanceIndex,
  );
  if (element) restoreValue(element, snapshot.mutation, snapshot.prior);
}

/**
 * Observe the element's current state as a mutation of the same shape — the
 * payload of a `reconcile-observe`.
 */
export function observe(
  root: ParentNode,
  mutation: DomMutation,
): DomMutation | null {
  const element = findInstance(root, mutation.path, mutation.instanceIndex);
  if (!element) return null;
  const { path, instanceIndex } = mutation;
  switch (mutation.kind) {
    case "text":
      return { kind: "text", path, instanceIndex, text: element.textContent ?? "" };
    case "class":
      return {
        kind: "class",
        path,
        instanceIndex,
        className: element.getAttribute("class") ?? "",
      };
    case "attr":
      return {
        kind: "attr",
        path,
        instanceIndex,
        name: mutation.name,
        value: element.getAttribute(mutation.name) ?? "",
      };
  }
}

function readValue(element: Element, mutation: DomMutation): string {
  switch (mutation.kind) {
    case "text":
      return element.textContent ?? "";
    case "class":
      return element.getAttribute("class") ?? "";
    case "attr":
      return element.getAttribute(mutation.name) ?? "";
  }
}

function writeValue(element: Element, mutation: DomMutation): void {
  switch (mutation.kind) {
    case "text":
      element.textContent = mutation.text;
      break;
    case "class":
      element.setAttribute("class", mutation.className);
      break;
    case "attr":
      element.setAttribute(mutation.name, mutation.value);
      break;
  }
}

function restoreValue(
  element: Element,
  mutation: DomMutation,
  prior: string,
): void {
  switch (mutation.kind) {
    case "text":
      element.textContent = prior;
      break;
    case "class":
      element.setAttribute("class", prior);
      break;
    case "attr":
      element.setAttribute(mutation.name, prior);
      break;
  }
}
