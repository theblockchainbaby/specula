import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  collectTextTargets,
  applyReplacement,
} from "../src/replace.js";

const HTML = `
<main data-spc="page.tsx#E/main:0">
  <h1 data-spc="page.tsx#E/main:0/h1:0">Hello World</h1>
  <p data-spc="page.tsx#E/main:0/p:0">Goodbye World</p>
  <section data-spc="page.tsx#E/main:0/section:0">
    <span data-spc="page.tsx#E/main:0/section:0/span:0">Another World</span>
  </section>
</main>
`;

function root(): Element {
  return new JSDOM(HTML).window.document.querySelector("main")!;
}

// --- collectTextTargets ----------------------------------------------------

test("collectTextTargets finds every instrumented text-leaf descendant", () => {
  const targets = collectTextTargets(root(), "World");
  assert.equal(targets.length, 3);
  const paths = targets.map((t) => t.selection.path).sort();
  assert.deepEqual(paths, [
    "page.tsx#E/main:0/h1:0",
    "page.tsx#E/main:0/p:0",
    "page.tsx#E/main:0/section:0/span:0",
  ]);
});

test("collectTextTargets does not match the wrapping element when only its child matches", () => {
  // The `<main>` itself contains "World" via its descendants, but its own
  // direct text content (excluding children) is whitespace only. It should
  // NOT be returned as a target.
  const targets = collectTextTargets(root(), "World");
  assert.equal(
    targets.find((t) => t.selection.path === "page.tsx#E/main:0"),
    undefined,
  );
});

test("collectTextTargets returns empty array when no text matches the find string", () => {
  assert.equal(collectTextTargets(root(), "Nope").length, 0);
});

test("collectTextTargets respects case sensitivity", () => {
  // Match "world" (lowercase) should return 0 because the source has "World".
  assert.equal(collectTextTargets(root(), "world").length, 0);
});

test("collectTextTargets handles partial matches within a longer text node", () => {
  const targets = collectTextTargets(root(), "Hello");
  assert.equal(targets.length, 1);
  assert.equal(targets[0].selection.path, "page.tsx#E/main:0/h1:0");
});

// --- applyReplacement ------------------------------------------------------

test("applyReplacement returns the original text with find replaced", () => {
  assert.equal(applyReplacement("Hello World", "World", "Friend"), "Hello Friend");
});

test("applyReplacement replaces every occurrence in a single text node", () => {
  assert.equal(
    applyReplacement("World World World", "World", "X"),
    "X X X",
  );
});

test("applyReplacement returns the same string when find is empty", () => {
  assert.equal(applyReplacement("Hello", "", "X"), "Hello");
});

test("applyReplacement escapes regex metacharacters in find", () => {
  // The user is doing literal text replacement, not regex. `.` should match
  // only a literal period, not "any character".
  assert.equal(applyReplacement("a.b.c", ".", "-"), "a-b-c");
  assert.equal(
    applyReplacement("a(b)c", "(b)", "[b]"),
    "a[b]c",
  );
});
