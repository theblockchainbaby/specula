import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { installKeyboardShortcuts } from "../src/keyboard.js";
import type { Intent, Selection } from "../src/intent.js";

const SELECTION: Selection = { path: "page.tsx#E/h1:0", instanceIndex: 0 };

interface Harness {
  document: Document;
  window: Window & typeof globalThis;
  intents: Intent[];
  deselects: number;
  setSelection(s: Selection | null): void;
  press(key: string, opts?: KeyboardEventInit): void;
}

function setup(initial: Selection | null = SELECTION): Harness {
  const dom = new JSDOM("<body><div id='specula-inspector'></div></body>");
  const { document } = dom.window;
  let selection = initial;
  const intents: Intent[] = [];
  let deselects = 0;

  installKeyboardShortcuts(document, {
    getSelection: () => selection,
    sendIntent: (intent) => intents.push(intent),
    deselect: () => {
      deselects += 1;
      selection = null;
    },
    inspectorRoot: () => document.getElementById("specula-inspector"),
  });

  const press = (key: string, opts: KeyboardEventInit = {}): void => {
    document.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...opts,
      }),
    );
  };

  return {
    document,
    window: dom.window as unknown as Window & typeof globalThis,
    intents,
    get deselects() {
      return deselects;
    },
    setSelection: (s) => {
      selection = s;
    },
    press,
  };
}

// --- verb shortcuts -------------------------------------------------------

test("d emits a duplicate intent when an element is selected", () => {
  const h = setup();
  h.press("d");
  assert.equal(h.intents.length, 1);
  assert.equal(h.intents[0]?.verb, "duplicate");
});

test("Delete emits a delete intent when an element is selected", () => {
  const h = setup();
  h.press("Delete");
  assert.equal(h.intents.length, 1);
  assert.equal(h.intents[0]?.verb, "delete");
});

test("Backspace emits a delete intent (mirrors Delete on keyboards without one)", () => {
  const h = setup();
  h.press("Backspace");
  assert.equal(h.intents.length, 1);
  assert.equal(h.intents[0]?.verb, "delete");
});

test("Escape deselects the current selection", () => {
  const h = setup();
  h.press("Escape");
  assert.equal(h.deselects, 1);
});

// --- guards ---------------------------------------------------------------

test("verb shortcuts do nothing when nothing is selected", () => {
  const h = setup(null);
  h.press("d");
  h.press("Delete");
  h.press("Backspace");
  assert.equal(h.intents.length, 0);
});

test("shortcuts do nothing while typing into an input", () => {
  const h = setup();
  const input = h.document.createElement("input");
  h.document.body.appendChild(input);
  input.focus();
  h.press("d");
  h.press("Delete");
  assert.equal(h.intents.length, 0);
});

test("shortcuts do nothing while typing into a textarea", () => {
  const h = setup();
  const ta = h.document.createElement("textarea");
  h.document.body.appendChild(ta);
  ta.focus();
  h.press("d");
  assert.equal(h.intents.length, 0);
});

test("shortcuts do nothing while typing into a contenteditable", () => {
  const h = setup();
  const el = h.document.createElement("div");
  el.setAttribute("contenteditable", "true");
  h.document.body.appendChild(el);
  el.focus();
  h.press("d");
  assert.equal(h.intents.length, 0);
});

test("cmd+d / ctrl+d don't trigger duplicate (browser shortcut wins)", () => {
  const h = setup();
  h.press("d", { metaKey: true });
  h.press("d", { ctrlKey: true });
  assert.equal(h.intents.length, 0);
});

// --- focus shortcuts ------------------------------------------------------

test("t focuses the text input in the inspector if present", () => {
  const h = setup();
  const input = h.document.createElement("input");
  input.dataset.speculaField = "text";
  h.document.getElementById("specula-inspector")!.appendChild(input);
  h.press("t");
  assert.equal(h.document.activeElement, input);
});

test("c focuses the class adder in the inspector if present", () => {
  const h = setup();
  const adder = h.document.createElement("input");
  adder.dataset.speculaField = "add-class";
  h.document.getElementById("specula-inspector")!.appendChild(adder);
  h.press("c");
  assert.equal(h.document.activeElement, adder);
});

test("t does nothing when the inspector has no text field", () => {
  const h = setup();
  const before = h.document.activeElement;
  h.press("t");
  assert.equal(h.document.activeElement, before);
});
