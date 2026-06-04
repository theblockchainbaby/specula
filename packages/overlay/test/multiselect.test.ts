import { test } from "node:test";
import assert from "node:assert/strict";
import { MultiSelection } from "../src/multiselect.js";
import type { Selection } from "../src/intent.js";

const A: Selection = { path: "page.tsx#E/h1:0", instanceIndex: 0 };
const B: Selection = { path: "page.tsx#E/p:0", instanceIndex: 0 };
const C: Selection = { path: "page.tsx#E/div:0", instanceIndex: 0 };

test("a fresh MultiSelection is empty", () => {
  const m = new MultiSelection();
  assert.equal(m.size, 0);
  assert.deepEqual(m.list(), []);
});

test("add adds a selection", () => {
  const m = new MultiSelection();
  m.add(A);
  assert.equal(m.size, 1);
  assert.deepEqual(m.list(), [A]);
});

test("adding the same selection twice is idempotent", () => {
  const m = new MultiSelection();
  m.add(A);
  m.add(A);
  assert.equal(m.size, 1);
});

test("toggle adds a not-present selection", () => {
  const m = new MultiSelection();
  m.toggle(A);
  assert.equal(m.size, 1);
  assert.ok(m.has(A));
});

test("toggle removes a present selection", () => {
  const m = new MultiSelection();
  m.add(A);
  m.toggle(A);
  assert.equal(m.size, 0);
  assert.equal(m.has(A), false);
});

test("clear empties the set", () => {
  const m = new MultiSelection();
  m.add(A);
  m.add(B);
  m.add(C);
  m.clear();
  assert.equal(m.size, 0);
});

test("has compares by structural identity, not reference", () => {
  const m = new MultiSelection();
  m.add(A);
  assert.equal(m.has({ path: A.path, instanceIndex: A.instanceIndex }), true);
});

test("list preserves insertion order", () => {
  const m = new MultiSelection();
  m.add(B);
  m.add(A);
  m.add(C);
  assert.deepEqual(m.list(), [B, A, C]);
});

test("setOne replaces the entire set with a single selection", () => {
  const m = new MultiSelection();
  m.add(A);
  m.add(B);
  m.setOne(C);
  assert.equal(m.size, 1);
  assert.deepEqual(m.list(), [C]);
});

test("listeners fire on add", () => {
  const m = new MultiSelection();
  let calls = 0;
  m.subscribe(() => {
    calls += 1;
  });
  m.add(A);
  assert.equal(calls, 1);
});

test("listeners fire on toggle and clear of a non-empty set", () => {
  const m = new MultiSelection();
  let calls = 0;
  m.subscribe(() => {
    calls += 1;
  });
  m.toggle(A); // add → notify
  m.toggle(B); // add → notify
  m.clear(); // non-empty → notify
  assert.equal(calls, 3);
});

test("clearing an already-empty set does not notify", () => {
  const m = new MultiSelection();
  let calls = 0;
  m.subscribe(() => {
    calls += 1;
  });
  m.clear();
  assert.equal(calls, 0);
});

test("listeners do not fire on idempotent add", () => {
  const m = new MultiSelection();
  m.add(A);
  let calls = 0;
  m.subscribe(() => {
    calls += 1;
  });
  m.add(A);
  assert.equal(calls, 0);
});
