/**
 * Keyboard shortcuts — single keypresses that act on the currently selected
 * element. Skipped while the user is typing into any input/textarea/
 * contenteditable, so the inspector's own fields are unaffected.
 *
 * Verbs intentionally bound only to single keys without Cmd/Ctrl. Modifier
 * combinations (Cmd+D, Ctrl+D, …) belong to the browser.
 */

import {
  deleteElement,
  duplicateElement,
  type Intent,
  type Selection,
} from "./intent.js";

export interface KeyboardDeps {
  /** The currently selected element, or null. */
  getSelection: () => Selection | null;
  /** Dispatch an intent (verb) at the daemon. */
  sendIntent: (intent: Intent) => void;
  /** Clear the current selection (Esc). */
  deselect: () => void;
  /** The inspector panel's root DOM node, for focus shortcuts. */
  inspectorRoot: () => Element | null;
}

/** True if the user is currently typing somewhere — in which case shortcuts
 *  should not fire. */
function isTyping(document: Document): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // `isContentEditable` is unreliable in some DOM implementations (JSDOM);
  // fall back to the raw attribute so the guard holds either way.
  const ce = active.getAttribute("contenteditable");
  if (ce === "true" || ce === "" || ce === "plaintext-only") return true;
  if (active.isContentEditable) return true;
  return false;
}

export function installKeyboardShortcuts(
  document: Document,
  deps: KeyboardDeps,
): void {
  document.addEventListener("keydown", (event) => {
    if (isTyping(document)) return;
    // Cmd/Ctrl combinations belong to the browser, not Specula.
    if (event.metaKey || event.ctrlKey) return;

    switch (event.key) {
      case "Escape": {
        deps.deselect();
        event.preventDefault();
        return;
      }
      case "Delete":
      case "Backspace": {
        const selection = deps.getSelection();
        if (!selection) return;
        deps.sendIntent(deleteElement(selection));
        event.preventDefault();
        return;
      }
      case "d": {
        const selection = deps.getSelection();
        if (!selection) return;
        deps.sendIntent(duplicateElement(selection));
        event.preventDefault();
        return;
      }
      case "t": {
        const root = deps.inspectorRoot();
        const input = root?.querySelector<HTMLInputElement>(
          'input[data-specula-field="text"]',
        );
        if (input) {
          input.focus();
          event.preventDefault();
        }
        return;
      }
      case "c": {
        const root = deps.inspectorRoot();
        const input = root?.querySelector<HTMLInputElement>(
          'input[data-specula-field="add-class"]',
        );
        if (input) {
          input.focus();
          event.preventDefault();
        }
        return;
      }
    }
  });
}
