import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetIntentFromFile,
  editText,
  fileToBase64,
  replaceAsset,
  setClass,
  setStyle,
} from "../src/intent.js";

const SELECTION = { path: "page.tsx#Home/main:0/h1:0", instanceIndex: 0 };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("editText builds a well-formed edit-text intent", () => {
  const intent = editText(SELECTION, "New heading");
  assert.equal(intent.v, 1);
  assert.equal(intent.type, "intent");
  assert.equal(intent.verb, "edit-text");
  assert.match(intent.id, UUID);
  assert.deepEqual(intent.selection, SELECTION);
  if (intent.verb === "edit-text") assert.equal(intent.text, "New heading");
});

test("setClass carries the style state and class lists", () => {
  const intent = setClass(SELECTION, { variant: "hover", breakpoint: "md" }, [
    "bg-blue-500",
  ]);
  assert.equal(intent.verb, "set-class");
  if (intent.verb === "set-class") {
    assert.deepEqual(intent.state, { variant: "hover", breakpoint: "md" });
    assert.deepEqual(intent.add, ["bg-blue-500"]);
    assert.deepEqual(intent.remove, []);
  }
});

test("replaceAsset carries the asset payload", () => {
  const intent = replaceAsset(SELECTION, {
    name: "hero.png",
    dataBase64: "AAAA",
  });
  assert.equal(intent.verb, "replace-asset");
  if (intent.verb === "replace-asset") {
    assert.equal(intent.asset.name, "hero.png");
  }
});

test("each intent gets a unique id", () => {
  assert.notEqual(editText(SELECTION, "a").id, editText(SELECTION, "b").id);
});

test("fileToBase64 encodes a file's bytes", async () => {
  const file = new File(["hello"], "h.png", { type: "image/png" });
  assert.equal(atob(await fileToBase64(file)), "hello");
});

test("assetIntentFromFile builds a replace-asset intent from a file", async () => {
  const file = new File(["png-bytes"], "hero.png", { type: "image/png" });
  const intent = await assetIntentFromFile(SELECTION, file);
  assert.equal(intent.verb, "replace-asset");
  if (intent.verb === "replace-asset") {
    assert.equal(intent.asset.name, "hero.png");
    assert.equal(atob(intent.asset.dataBase64), "png-bytes");
  }
});

test("setStyle builds a set-style intent", () => {
  const intent = setStyle(SELECTION, { variant: "hover" }, "padding", "16px");
  assert.equal(intent.verb, "set-style");
  if (intent.verb === "set-style") {
    assert.equal(intent.property, "padding");
    assert.equal(intent.value, "16px");
    assert.deepEqual(intent.state, { variant: "hover" });
  }
});
