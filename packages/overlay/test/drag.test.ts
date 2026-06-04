import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { installDragReorder } from "../src/drag.js";
import type { Intent, Selection } from "../src/intent.js";

interface Harness {
  document: Document;
  window: Window & typeof globalThis;
  intents: Intent[];
  parent: Element;
  h1: Element;
  p: Element;
  setSelected(el: Element | null): void;
}

function setup(): Harness {
  const dom = new JSDOM(
    `<main>` +
      `<h1 data-spc="page.tsx#E/main:0/h1:0">a</h1>` +
      `<p data-spc="page.tsx#E/main:0/p:0">b</p>` +
      `<span data-spc="page.tsx#E/main:0/span:0">c</span>` +
      `</main>`,
  );
  const { document } = dom.window;
  const intents: Intent[] = [];
  let selected: Element | null = null;
  installDragReorder(document, {
    getSelected: () => {
      if (!selected) return null;
      const path = selected.getAttribute("data-spc");
      if (!path) return null;
      return {
        element: selected,
        selection: { path, instanceIndex: 0 },
      };
    },
    sendIntent: (intent) => intents.push(intent),
  });

  return {
    document,
    window: dom.window as unknown as Window & typeof globalThis,
    intents,
    parent: document.querySelector("main")!,
    h1: document.querySelector("h1")!,
    p: document.querySelector("p")!,
    setSelected: (el) => {
      selected = el;
    },
  };
}

function fireDrop(
  dragged: Element,
  target: Element,
  window: Window & typeof globalThis,
): void {
  // JSDOM doesn't ship DragEvent; the overlay only inspects `target` and
  // `preventDefault`, so a plain Event of the right type is enough.
  const fire = (el: Element, type: string): Event => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  fire(dragged, "dragstart");
  fire(target, "dragover");
  fire(target, "drop");
}

// --- core dispatch --------------------------------------------------------

test("dropping the selected element on its next sibling emits a move intent", () => {
  const h = setup();
  h.setSelected(h.h1);
  fireDrop(h.h1, h.p, h.window);
  assert.equal(h.intents.length, 1);
  assert.equal(h.intents[0]?.verb, "move");
  if (h.intents[0]?.verb === "move") {
    assert.equal(h.intents[0].sibling.path, "page.tsx#E/main:0/p:0");
  }
});

test("dropping on the previous sibling emits a move with that sibling", () => {
  const h = setup();
  h.setSelected(h.p);
  fireDrop(h.p, h.h1, h.window);
  assert.equal(h.intents[0]?.verb, "move");
  if (h.intents[0]?.verb === "move") {
    assert.equal(h.intents[0].sibling.path, "page.tsx#E/main:0/h1:0");
  }
});

test("drop on a non-adjacent sibling emits nothing (v1 only swaps neighbors)", () => {
  const h = setup();
  h.setSelected(h.h1);
  const span = h.document.querySelector("span")!;
  fireDrop(h.h1, span, h.window);
  assert.equal(h.intents.length, 0);
});

test("drop on self emits nothing", () => {
  const h = setup();
  h.setSelected(h.h1);
  fireDrop(h.h1, h.h1, h.window);
  assert.equal(h.intents.length, 0);
});

test("drop with no selection emits nothing", () => {
  const h = setup();
  fireDrop(h.h1, h.p, h.window);
  assert.equal(h.intents.length, 0);
});

test("drop on a non-instrumented element emits nothing", () => {
  const h = setup();
  h.setSelected(h.h1);
  const plain = h.document.createElement("div"); // no data-spc
  h.parent.insertBefore(plain, h.p);
  fireDrop(h.h1, plain, h.window);
  assert.equal(h.intents.length, 0);
});

