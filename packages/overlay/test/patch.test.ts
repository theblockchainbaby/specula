import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { applyMutation, findInstance, observe, revertMutation } from "../src/patch.js";
import type { DomMutation } from "../src/patch.js";

function dom(html: string): Document {
  return new JSDOM(html).window.document;
}

test("applyMutation replaces text and snapshots the prior value", () => {
  const document = dom(`<h1 data-spc="p#E/h1:0">Old</h1>`);
  const snapshot = applyMutation(document, {
    kind: "text",
    path: "p#E/h1:0",
    instanceIndex: 0,
    text: "New",
  });
  assert.ok(snapshot);
  assert.equal(document.querySelector("h1")?.textContent, "New");
  assert.equal(snapshot.prior, "Old");
});

test("revertMutation restores the snapshotted value", () => {
  const document = dom(`<h1 data-spc="p#E/h1:0">Old</h1>`);
  const snapshot = applyMutation(document, {
    kind: "text",
    path: "p#E/h1:0",
    instanceIndex: 0,
    text: "New",
  });
  revertMutation(document, snapshot!);
  assert.equal(document.querySelector("h1")?.textContent, "Old");
});

test("applyMutation sets a class mutation", () => {
  const document = dom(`<h1 data-spc="p#E/h1:0" class="old">x</h1>`);
  applyMutation(document, {
    kind: "class",
    path: "p#E/h1:0",
    instanceIndex: 0,
    className: "text-xl font-bold",
  });
  assert.equal(document.querySelector("h1")?.getAttribute("class"), "text-xl font-bold");
});

test("applyMutation sets an attribute mutation", () => {
  const document = dom(`<img data-spc="p#E/img:0" src="/old.png" />`);
  applyMutation(document, {
    kind: "attr",
    path: "p#E/img:0",
    instanceIndex: 0,
    name: "src",
    value: "/new.png",
  });
  assert.equal(document.querySelector("img")?.getAttribute("src"), "/new.png");
});

test("findInstance picks the Nth element sharing a path", () => {
  const document = dom(
    `<ul><li data-spc="L#L/li:0">a</li><li data-spc="L#L/li:0">b</li></ul>`,
  );
  assert.equal(findInstance(document, "L#L/li:0", 1)?.textContent, "b");
});

test("applyMutation returns null when the target is absent", () => {
  const document = dom(`<div>nothing instrumented</div>`);
  const mutation: DomMutation = {
    kind: "text",
    path: "x#Y/z:0",
    instanceIndex: 0,
    text: "n",
  };
  assert.equal(applyMutation(document, mutation), null);
});

test("observe reads the element's current state", () => {
  const document = dom(`<h1 data-spc="p#E/h1:0">Hello</h1>`);
  const observed = observe(document, {
    kind: "text",
    path: "p#E/h1:0",
    instanceIndex: 0,
    text: "ignored",
  });
  assert.deepEqual(observed, {
    kind: "text",
    path: "p#E/h1:0",
    instanceIndex: 0,
    text: "Hello",
  });
});
