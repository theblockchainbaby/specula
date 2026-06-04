/**
 * Building intent messages — see `specs/protocol.md`.
 *
 * The protocol shapes are duplicated minimally here because the overlay ships
 * to the browser as its own artifact; a shared `@specula/protocol` package is
 * the right long-term home for the single definition.
 */

export interface Selection {
  path: string;
  instanceIndex: number;
}

export interface StyleState {
  variant?: "hover" | "focus" | "focus-visible" | "active";
  breakpoint?: "sm" | "md" | "lg" | "xl" | "2xl";
  scheme?: "light" | "dark";
}

interface IntentEnvelope {
  v: 1;
  id: string;
  type: "intent";
  selection: Selection;
}

export type Intent =
  | (IntentEnvelope & { verb: "edit-text"; text: string })
  | (IntentEnvelope & {
      verb: "set-class";
      state: StyleState;
      add: string[];
      remove: string[];
    })
  | (IntentEnvelope & {
      verb: "set-style";
      state: StyleState;
      property: string;
      value: string;
    })
  | (IntentEnvelope & {
      verb: "replace-asset";
      asset: { name: string; dataBase64: string };
    })
  | (IntentEnvelope & { verb: "delete" })
  | (IntentEnvelope & { verb: "duplicate" })
  | (IntentEnvelope & { verb: "wrap"; tag: string })
  | (IntentEnvelope & { verb: "move"; sibling: Selection });

function envelope(selection: Selection): IntentEnvelope {
  return { v: 1, id: crypto.randomUUID(), type: "intent", selection };
}

/** An `edit-text` intent — replace a JSX text node's literal content. */
export function editText(selection: Selection, text: string): Intent {
  return { ...envelope(selection), verb: "edit-text", text };
}

/** A `set-class` intent — add/remove Tailwind classes for a style state. */
export function setClass(
  selection: Selection,
  state: StyleState,
  add: string[],
  remove: string[] = [],
): Intent {
  return { ...envelope(selection), verb: "set-class", state, add, remove };
}

/** A `set-style` intent — set a CSS property (lowered to a Tailwind class). */
export function setStyle(
  selection: Selection,
  state: StyleState,
  property: string,
  value: string,
): Intent {
  return { ...envelope(selection), verb: "set-style", state, property, value };
}

/** A `replace-asset` intent — swap an image. */
export function replaceAsset(
  selection: Selection,
  asset: { name: string; dataBase64: string },
): Intent {
  return { ...envelope(selection), verb: "replace-asset", asset };
}

/** A `delete` intent — remove the element. */
export function deleteElement(selection: Selection): Intent {
  return { ...envelope(selection), verb: "delete" };
}

/** A `duplicate` intent — insert a copy of the element after it. */
export function duplicateElement(selection: Selection): Intent {
  return { ...envelope(selection), verb: "duplicate" };
}

/** A `wrap` intent — enclose the element in a `<tag>…</tag>`. */
export function wrapElement(selection: Selection, tag: string): Intent {
  return { ...envelope(selection), verb: "wrap", tag };
}

/** An `unwrap` intent — remove the wrapping element, keep its children. */
export function unwrapElement(selection: Selection): Intent {
  return { ...envelope(selection), verb: "unwrap" };
}

/** A `toggle-conditional` intent — flip `{x && <el>}` ↔ `{!x && <el>}`. */
export function toggleConditional(selection: Selection): Intent {
  return { ...envelope(selection), verb: "toggle-conditional" };
}

/** A `set-prop` intent — set an arbitrary JSX attribute's literal value. */
export function setProp(
  selection: Selection,
  attr: string,
  value: string,
): Intent {
  return { ...envelope(selection), verb: "set-prop", attr, value };
}

/** An `extract-component` intent — pull the element into its own .tsx file. */
export function extractComponent(selection: Selection, name: string): Intent {
  return { ...envelope(selection), verb: "extract-component", name };
}

/** A `move` intent — swap the element with an adjacent sibling. */
export function moveElement(selection: Selection, sibling: Selection): Intent {
  return { ...envelope(selection), verb: "move", sibling };
}

/** Read a `File`'s bytes as base64 (no data-URL prefix). Works in the browser
 *  and in Node — `File.arrayBuffer` and `btoa` are available in both. */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** A `replace-asset` intent built from a picked file. */
export async function assetIntentFromFile(
  selection: Selection,
  file: File,
): Promise<Intent> {
  return replaceAsset(selection, {
    name: file.name,
    dataBase64: await fileToBase64(file),
  });
}
