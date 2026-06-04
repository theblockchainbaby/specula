import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  installArrowKeyNudge,
  parseMarginValue,
  classFromValue,
} from "../src/nudge.js";
import type { Intent, Selection } from "../src/intent.js";

const SELECTION: Selection = { path: "page.tsx#E/h1:0", instanceIndex: 0 };

interface Harness {
  document: Document;
  intents: Intent[];
  setElement(html: string): Element;
  press(key: string, opts?: KeyboardEventInit): void;
}

function setup(): Harness {
  const dom = new JSDOM("<body><div id='target' class=''></div></body>");
  const { document } = dom.window;
  const intents: Intent[] = [];
  let element: Element | null = document.getElementById("target");

  installArrowKeyNudge(document, {
    getSelection: () => (element ? SELECTION : null),
    getSelectedElement: () => element,
    sendIntent: (intent) => intents.push(intent),
  });

  return {
    document,
    intents,
    setElement(html: string): Element {
      document.body.innerHTML = html;
      element = document.querySelector("[data-test]");
      return element!;
    },
    press: (key, opts = {}): void => {
      document.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          ...opts,
        }),
      );
    },
  };
}

// --- pure helpers ----------------------------------------------------------

test("parseMarginValue reads mt-N as positive integer", () => {
  assert.equal(parseMarginValue("mt-3 text-lg", "mt"), 3);
});

test("parseMarginValue reads -mt-N as negative integer", () => {
  assert.equal(parseMarginValue("-mt-2 text-lg", "mt"), -2);
});

test("parseMarginValue returns 0 when no margin class is present", () => {
  assert.equal(parseMarginValue("text-lg font-bold", "mt"), 0);
});

test("parseMarginValue ignores other margin axes", () => {
  assert.equal(parseMarginValue("mb-4 ml-2", "mt"), 0);
});

test("parseMarginValue ignores arbitrary values like mt-[10px]", () => {
  assert.equal(parseMarginValue("mt-[10px]", "mt"), 0);
});

test("classFromValue produces positive class for positive value", () => {
  assert.equal(classFromValue("mt", 3), "mt-3");
});

test("classFromValue produces negative class for negative value", () => {
  assert.equal(classFromValue("mt", -2), "-mt-2");
});

test("classFromValue returns null for zero", () => {
  assert.equal(classFromValue("mt", 0), null);
});

// --- nudge dispatch --------------------------------------------------------

test("ArrowDown emits set-class adding mt-1 from a zero-margin element", () => {
  const h = setup();
  h.press("ArrowDown");
  assert.equal(h.intents.length, 1);
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, ["mt-1"]);
    assert.deepEqual(h.intents[0].remove, []);
  }
});

test("ArrowUp emits -mt-1 from a zero-margin element", () => {
  const h = setup();
  h.press("ArrowUp");
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, ["-mt-1"]);
    assert.deepEqual(h.intents[0].remove, []);
  }
});

test("ArrowRight emits ml-1 from a zero-margin element", () => {
  const h = setup();
  h.press("ArrowRight");
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, ["ml-1"]);
  }
});

test("ArrowLeft emits -ml-1 from a zero-margin element", () => {
  const h = setup();
  h.press("ArrowLeft");
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, ["-ml-1"]);
  }
});

test("Shift+ArrowDown jumps by 4 (big step)", () => {
  const h = setup();
  h.press("ArrowDown", { shiftKey: true });
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, ["mt-4"]);
  }
});

test("ArrowDown on an element with mt-2 increments to mt-3 and removes mt-2", () => {
  const h = setup();
  h.setElement('<div data-test class="mt-2 text-lg"></div>');
  h.press("ArrowDown");
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, ["mt-3"]);
    assert.deepEqual(h.intents[0].remove, ["mt-2"]);
  }
});

test("ArrowUp on an element with mt-2 decrements to mt-1", () => {
  const h = setup();
  h.setElement('<div data-test class="mt-2"></div>');
  h.press("ArrowUp");
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, ["mt-1"]);
    assert.deepEqual(h.intents[0].remove, ["mt-2"]);
  }
});

test("ArrowUp on an element with mt-1 lands at zero — removes the class with no add", () => {
  const h = setup();
  h.setElement('<div data-test class="mt-1 text-lg"></div>');
  h.press("ArrowUp");
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, []);
    assert.deepEqual(h.intents[0].remove, ["mt-1"]);
  }
});

test("ArrowUp on an element with -mt-2 decrements to -mt-3", () => {
  const h = setup();
  h.setElement('<div data-test class="-mt-2"></div>');
  h.press("ArrowUp");
  assert.equal(h.intents[0]?.verb, "set-class");
  if (h.intents[0]?.verb === "set-class") {
    assert.deepEqual(h.intents[0].add, ["-mt-3"]);
    assert.deepEqual(h.intents[0].remove, ["-mt-2"]);
  }
});

// --- guards ---------------------------------------------------------------

test("arrow keys do nothing while typing into an input", () => {
  const h = setup();
  const input = h.document.createElement("input");
  h.document.body.appendChild(input);
  input.focus();
  h.press("ArrowDown");
  h.press("ArrowUp");
  assert.equal(h.intents.length, 0);
});

test("Cmd+ArrowDown does not nudge (browser shortcut)", () => {
  const h = setup();
  h.press("ArrowDown", { metaKey: true });
  assert.equal(h.intents.length, 0);
});
