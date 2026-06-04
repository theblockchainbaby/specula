import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Inspector } from "../src/inspector.js";
import type { Intent, Selection } from "../src/intent.js";

const SELECTION = { path: "page.tsx#E/h1:0", instanceIndex: 0 };

function setup() {
  const window = new JSDOM("<body></body>").window;
  const document = window.document;
  const intents: Intent[] = [];
  const reselects: Selection[] = [];
  const inspector = new Inspector(
    document,
    (intent) => intents.push(intent),
    (selection) => reselects.push(selection),
  );
  const enter = (input: HTMLInputElement): void => {
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  };
  return { document, intents, reselects, inspector, enter };
}

test("show renders a text field pre-filled with the current text", () => {
  const { document, inspector } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { text: { value: "Hello", isDynamic: false } },
  });
  const input = document.querySelector<HTMLInputElement>(
    '#specula-inspector input[data-specula-field="text"]',
  );
  assert.ok(input);
  assert.equal(input.value, "Hello");
});

test("editing the text field and pressing Enter emits an edit-text intent", () => {
  const { document, intents, inspector, enter } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { text: { value: "Hello", isDynamic: false } },
  });
  const input = document.querySelector<HTMLInputElement>(
    'input[data-specula-field="text"]',
  )!;
  input.value = "Goodbye";
  enter(input);

  assert.equal(intents.length, 1);
  assert.equal(intents[0]?.verb, "edit-text");
  if (intents[0]?.verb === "edit-text") assert.equal(intents[0].text, "Goodbye");
});

test("an unchanged text field emits nothing", () => {
  const { document, intents, inspector, enter } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { text: { value: "Hello", isDynamic: false } },
  });
  enter(document.querySelector<HTMLInputElement>('input[data-specula-field="text"]')!);
  assert.equal(intents.length, 0);
});

test("clicking a class chip emits a set-class remove intent", () => {
  const { document, intents, inspector } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { classes: { base: ["p-4", "font-bold"] } },
  });
  const chip = document.querySelector<HTMLButtonElement>(
    '[data-specula-class="font-bold"]',
  );
  assert.ok(chip);
  chip.click();

  assert.equal(intents[0]?.verb, "set-class");
  if (intents[0]?.verb === "set-class") {
    assert.deepEqual(intents[0].remove, ["font-bold"]);
    assert.deepEqual(intents[0].add, []);
  }
});

test("the add-class input emits a set-class add intent on Enter", () => {
  const { document, intents, inspector, enter } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { classes: { base: ["p-4"] } },
  });
  const adder = document.querySelector<HTMLInputElement>(
    'input[data-specula-field="add-class"]',
  )!;
  adder.value = "text-xl";
  enter(adder);

  assert.equal(intents[0]?.verb, "set-class");
  if (intents[0]?.verb === "set-class") assert.deepEqual(intents[0].add, ["text-xl"]);
});

test("hide collapses the panel", () => {
  const { document, inspector } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { text: { value: "x", isDynamic: false } },
  });
  inspector.hide();
  const panel = document.getElementById("specula-inspector");
  assert.equal(panel?.style.display, "none");
});

test("show renders the structural action buttons", () => {
  const { document, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  for (const action of ["delete", "duplicate", "wrap", "unwrap", "up", "down"]) {
    assert.ok(
      document.querySelector(
        `#specula-inspector [data-specula-action="${action}"]`,
      ),
      `missing the ${action} button`,
    );
  }
});

test("the Delete button emits a delete intent", () => {
  const { document, intents, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  document
    .querySelector<HTMLButtonElement>('[data-specula-action="delete"]')!
    .click();
  assert.equal(intents[0]?.verb, "delete");
});

test("the Duplicate button emits a duplicate intent", () => {
  const { document, intents, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  document
    .querySelector<HTMLButtonElement>('[data-specula-action="duplicate"]')!
    .click();
  assert.equal(intents[0]?.verb, "duplicate");
});

test("the Wrap button emits a wrap intent with a div tag", () => {
  const { document, intents, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  document
    .querySelector<HTMLButtonElement>('[data-specula-action="wrap"]')!
    .click();
  assert.equal(intents[0]?.verb, "wrap");
  if (intents[0]?.verb === "wrap") assert.equal(intents[0].tag, "div");
});

test("the Unwrap button is disabled when the element has no children", () => {
  const { document, inspector } = setup();
  // No element passed → element is null → nothing inside to keep on unwrap.
  inspector.show({ selection: SELECTION, editable: {} });
  const unwrap = document.querySelector<HTMLButtonElement>(
    '[data-specula-action="unwrap"]',
  );
  assert.ok(unwrap);
  assert.equal(unwrap.disabled, true);
});

test("the Unwrap button emits an unwrap intent when the element has children", () => {
  const document = new JSDOM(
    `<div data-spc="page.tsx#E/div:0">` +
      `<h1 data-spc="page.tsx#E/div:0/h1:0">a</h1>` +
      `</div>`,
  ).window.document;
  const intents: Intent[] = [];
  const inspector = new Inspector(document, (intent) => intents.push(intent));
  inspector.show(
    { selection: { path: "page.tsx#E/div:0", instanceIndex: 0 }, editable: {} },
    document.querySelector("div"),
  );
  document
    .querySelector<HTMLButtonElement>('[data-specula-action="unwrap"]')!
    .click();
  assert.equal(intents[0]?.verb, "unwrap");
});

test("the Up button emits a move intent swapping with the sibling", () => {
  const document = new JSDOM(
    `<main>` +
      `<h1 data-spc="page.tsx#E/main:0/h1:0">a</h1>` +
      `<p data-spc="page.tsx#E/main:0/p:0">b</p>` +
      `</main>`,
  ).window.document;
  const intents: Intent[] = [];
  const inspector = new Inspector(document, (intent) => intents.push(intent));
  inspector.show(
    {
      selection: { path: "page.tsx#E/main:0/p:0", instanceIndex: 0 },
      editable: {},
    },
    document.querySelector("p"),
  );
  document
    .querySelector<HTMLButtonElement>('[data-specula-action="up"]')!
    .click();
  assert.equal(intents[0]?.verb, "move");
  if (intents[0]?.verb === "move") {
    assert.equal(intents[0].sibling.path, "page.tsx#E/main:0/h1:0");
  }
});

test("a move with no instrumented sibling emits nothing", () => {
  const { document, intents, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} }, null);
  document
    .querySelector<HTMLButtonElement>('[data-specula-action="up"]')!
    .click();
  assert.equal(intents.length, 0);
});

const LADDER = [
  { selection: { path: "page.tsx#E/main:0/h1:0", instanceIndex: 0 }, label: "h1" },
  { selection: { path: "page.tsx#E/main:0", instanceIndex: 0 }, label: "main" },
];

test("show renders the selection ladder, outermost first", () => {
  const { document, inspector } = setup();
  inspector.show({ selection: LADDER[0].selection, editable: {}, ladder: LADDER });
  const rungs = document.querySelectorAll(
    "#specula-inspector [data-specula-rung]",
  );
  assert.equal(rungs.length, 2);
  assert.equal(rungs[0].textContent, "main");
  assert.equal(rungs[1].textContent, "h1");
});

test("the current rung is marked and inert", () => {
  const { document, inspector } = setup();
  inspector.show({ selection: LADDER[0].selection, editable: {}, ladder: LADDER });
  const current = document.querySelector<HTMLButtonElement>(
    "[data-specula-current]",
  );
  assert.equal(current?.textContent, "h1");
  assert.equal(current?.disabled, true);
});

test("clicking an ancestor rung re-selects it", () => {
  const { document, reselects, inspector } = setup();
  inspector.show({ selection: LADDER[0].selection, editable: {}, ladder: LADDER });
  document
    .querySelector<HTMLButtonElement>(
      '[data-specula-rung="page.tsx#E/main:0"]',
    )!
    .click();
  assert.equal(reselects.length, 1);
  assert.equal(reselects[0]?.path, "page.tsx#E/main:0");
});

test("a single-rung ladder is not rendered", () => {
  const { document, inspector } = setup();
  inspector.show({
    selection: LADDER[0].selection,
    editable: {},
    ladder: [LADDER[0]],
  });
  assert.equal(document.querySelector("[data-specula-rung]"), null);
});

test("show renders a file picker for the asset field", () => {
  const { document, inspector } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { asset: { src: "/hero.png", resolved: "/hero.png" } },
  });
  const input = document.querySelector<HTMLInputElement>(
    '#specula-inspector input[data-specula-field="asset"]',
  );
  assert.ok(input);
  assert.equal(input.type, "file");
});

test("the style field emits a set-style intent on Enter", () => {
  const { document, intents, inspector, enter } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  const property = document.querySelector<HTMLInputElement>(
    'input[data-specula-field="style-property"]',
  )!;
  const value = document.querySelector<HTMLInputElement>(
    'input[data-specula-field="style-value"]',
  )!;
  property.value = "padding";
  value.value = "16px";
  enter(value);

  assert.equal(intents[0]?.verb, "set-style");
  if (intents[0]?.verb === "set-style") {
    assert.equal(intents[0].property, "padding");
    assert.equal(intents[0].value, "16px");
  }
});

// --- empty state -----------------------------------------------------------

test("show renders an empty-state note when nothing is inline-editable", () => {
  const { document, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  assert.ok(
    document.querySelector("#specula-inspector [data-specula-empty]"),
    "expected an empty-state note",
  );
});

test("the empty-state note is absent when the element has editable text", () => {
  const { document, inspector } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { text: { value: "Hello", isDynamic: false } },
  });
  assert.equal(document.querySelector("[data-specula-empty]"), null);
});

// --- disabled states -------------------------------------------------------

test("dynamic text renders a disabled text field", () => {
  const { document, inspector } = setup();
  inspector.show({
    selection: SELECTION,
    editable: { text: { value: "{title}", isDynamic: true } },
  });
  const input = document.querySelector<HTMLInputElement>(
    'input[data-specula-field="text"]',
  );
  assert.ok(input);
  assert.equal(input.disabled, true);
});

test("Up and Down are disabled when the element has no instrumented sibling", () => {
  const { document, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} }, null);
  const up = document.querySelector<HTMLButtonElement>('[data-specula-action="up"]');
  const down = document.querySelector<HTMLButtonElement>(
    '[data-specula-action="down"]',
  );
  assert.equal(up?.disabled, true);
  assert.equal(down?.disabled, true);
});

test("Up is enabled when an instrumented sibling precedes the element", () => {
  const document = new JSDOM(
    `<main>` +
      `<h1 data-spc="page.tsx#E/main:0/h1:0">a</h1>` +
      `<p data-spc="page.tsx#E/main:0/p:0">b</p>` +
      `</main>`,
  ).window.document;
  const inspector = new Inspector(document, () => {});
  inspector.show(
    { selection: { path: "page.tsx#E/main:0/p:0", instanceIndex: 0 }, editable: {} },
    document.querySelector("p"),
  );
  const up = document.querySelector<HTMLButtonElement>('[data-specula-action="up"]');
  const down = document.querySelector<HTMLButtonElement>(
    '[data-specula-action="down"]',
  );
  assert.equal(up?.disabled, false);
  assert.equal(down?.disabled, true);
});

// --- status footer ---------------------------------------------------------

test("setStatus reflects a transaction state in the footer", () => {
  const { document, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  inspector.setStatus("loading", "edit-text");
  const footer = document.querySelector<HTMLElement>("[data-specula-status]");
  assert.ok(footer);
  assert.equal(footer.dataset.speculaStatus, "loading");
  assert.match(footer.textContent ?? "", /edit-text/);
});

test("setStatus error surfaces the failure detail", () => {
  const { document, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  inspector.setStatus("error", "set-class", "parse-error");
  const footer = document.querySelector<HTMLElement>("[data-specula-status]");
  assert.equal(footer?.dataset.speculaStatus, "error");
  assert.match(footer?.textContent ?? "", /parse-error/);
});

test("show resets the footer to idle", () => {
  const { document, inspector } = setup();
  inspector.show({ selection: SELECTION, editable: {} });
  inspector.setStatus("error", "delete", "internal");
  inspector.show({ selection: SELECTION, editable: {} });
  const footer = document.querySelector<HTMLElement>("[data-specula-status]");
  assert.equal(footer?.dataset.speculaStatus, "idle");
});
