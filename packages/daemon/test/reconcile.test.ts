import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileMatches } from "../src/reconcile.js";

const P = "page.tsx#Home/main:0/h1:0";

test("matching text reconciles", () => {
  assert.equal(
    reconcileMatches(
      { kind: "text", path: P, instanceIndex: 0, text: "Hello" },
      { kind: "text", path: P, instanceIndex: 0, text: "Hello" },
    ),
    true,
  );
});

test("differing text is a divergence", () => {
  assert.equal(
    reconcileMatches(
      { kind: "text", path: P, instanceIndex: 0, text: "Hello" },
      { kind: "text", path: P, instanceIndex: 0, text: "Goodbye" },
    ),
    false,
  );
});

test("classes reconcile order-independently", () => {
  assert.equal(
    reconcileMatches(
      { kind: "class", path: P, instanceIndex: 0, className: "p-4 font-bold" },
      { kind: "class", path: P, instanceIndex: 0, className: "font-bold  p-4" },
    ),
    true,
  );
});

test("a different class set is a divergence", () => {
  assert.equal(
    reconcileMatches(
      { kind: "class", path: P, instanceIndex: 0, className: "p-4" },
      { kind: "class", path: P, instanceIndex: 0, className: "p-6" },
    ),
    false,
  );
});

test("a next/image src reconciles against the decoded url", () => {
  // next/image rewrites src to /_next/image?url=<encoded>&w=…
  assert.equal(
    reconcileMatches(
      { kind: "attr", path: P, instanceIndex: 0, name: "src", value: "/hero.png" },
      {
        kind: "attr",
        path: P,
        instanceIndex: 0,
        name: "src",
        value: "/_next/image?url=%2Fhero.png&w=640&q=75",
      },
    ),
    true,
  );
});

test("a genuinely different asset is a divergence", () => {
  assert.equal(
    reconcileMatches(
      { kind: "attr", path: P, instanceIndex: 0, name: "src", value: "/hero.png" },
      {
        kind: "attr",
        path: P,
        instanceIndex: 0,
        name: "src",
        value: "/_next/image?url=%2Fother.png&w=640&q=75",
      },
    ),
    false,
  );
});

test("a kind mismatch is a divergence", () => {
  assert.equal(
    reconcileMatches(
      { kind: "text", path: P, instanceIndex: 0, text: "x" },
      { kind: "class", path: P, instanceIndex: 0, className: "x" },
    ),
    false,
  );
});
