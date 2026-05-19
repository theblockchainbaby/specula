import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { OptimisticTracker, routeServerMessage } from "../src/optimistic.js";
import type { DomMutation } from "../src/patch.js";

const PATH = "p#E/h1:0";
const MUTATION: DomMutation = {
  kind: "text",
  path: PATH,
  instanceIndex: 0,
  text: "New",
};

function dom(): Document {
  return new JSDOM(`<h1 data-spc="${PATH}">Old</h1>`).window.document;
}

test("ack applies the optimistic patch and tracks it", () => {
  const document = dom();
  const tracker = new OptimisticTracker(document);
  tracker.ack("tx1", MUTATION);
  assert.equal(document.querySelector("h1")?.textContent, "New");
  assert.equal(tracker.pendingCount, 1);
});

test("commit confirms the patch and returns the observed state", () => {
  const document = dom();
  const tracker = new OptimisticTracker(document);
  tracker.ack("tx1", MUTATION);
  const observed = tracker.commit("tx1");
  assert.equal(tracker.pendingCount, 0);
  assert.deepEqual(observed, {
    kind: "text",
    path: PATH,
    instanceIndex: 0,
    text: "New",
  });
});

test("fail reverts the optimistic patch", () => {
  const document = dom();
  const tracker = new OptimisticTracker(document);
  tracker.ack("tx1", MUTATION);
  tracker.fail("tx1");
  assert.equal(document.querySelector("h1")?.textContent, "Old");
  assert.equal(tracker.pendingCount, 0);
});

test("routeServerMessage applies an intent-ack to the DOM", () => {
  const document = dom();
  const tracker = new OptimisticTracker(document);
  routeServerMessage(
    tracker,
    { type: "intent-ack", txId: "tx1", optimistic: MUTATION },
    () => {},
  );
  assert.equal(document.querySelector("h1")?.textContent, "New");
});

test("routeServerMessage emits a reconcile-observe after a commit", () => {
  const document = dom();
  const tracker = new OptimisticTracker(document);
  const reconciled: Array<{ txId: string; observed: DomMutation }> = [];

  routeServerMessage(
    tracker,
    { type: "intent-ack", txId: "tx1", optimistic: MUTATION },
    () => {},
  );
  routeServerMessage(
    tracker,
    { type: "intent-committed", txId: "tx1" },
    (txId, observed) => reconciled.push({ txId, observed }),
  );

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0]?.txId, "tx1");
  assert.equal((reconciled[0]?.observed as { kind: string }).kind, "text");
});

test("routeServerMessage reverts the DOM on intent-failed", () => {
  const document = dom();
  const tracker = new OptimisticTracker(document);
  routeServerMessage(
    tracker,
    { type: "intent-ack", txId: "tx1", optimistic: MUTATION },
    () => {},
  );
  routeServerMessage(tracker, { type: "intent-failed", txId: "tx1" }, () => {});
  assert.equal(document.querySelector("h1")?.textContent, "Old");
});
