import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bumpClass,
  parseScrubbable,
  type Scrubbable,
} from "../src/scrub.js";

// --- parseScrubbable -------------------------------------------------------

test("parseScrubbable recognizes integer scales (mt-N)", () => {
  const s = parseScrubbable("mt-8");
  assert.ok(s);
  assert.equal(s.kind, "integer");
  if (s.kind === "integer") {
    assert.equal(s.prefix, "mt-");
    assert.equal(s.value, 8);
    assert.equal(s.negative, false);
  }
});

test("parseScrubbable recognizes negative integer scales (-mt-N)", () => {
  const s = parseScrubbable("-mt-2");
  assert.ok(s);
  assert.equal(s.kind, "integer");
  if (s.kind === "integer") {
    assert.equal(s.value, 2);
    assert.equal(s.negative, true);
  }
});

test("parseScrubbable recognizes arbitrary px values (text-[44px])", () => {
  const s = parseScrubbable("text-[44px]");
  assert.ok(s);
  assert.equal(s.kind, "arbitrary");
  if (s.kind === "arbitrary") {
    assert.equal(s.prefix, "text-[");
    assert.equal(s.value, 44);
    assert.equal(s.unit, "px");
  }
});

test("parseScrubbable recognizes named text-size scale (text-lg)", () => {
  const s = parseScrubbable("text-lg");
  assert.ok(s);
  assert.equal(s.kind, "named");
  if (s.kind === "named") {
    assert.equal(s.family, "text-size");
    assert.equal(s.index >= 0, true);
  }
});

test("parseScrubbable recognizes named rounded scale (rounded-lg)", () => {
  const s = parseScrubbable("rounded-lg");
  assert.ok(s);
  assert.equal(s.kind, "named");
  if (s.kind === "named") assert.equal(s.family, "rounded");
});

test("parseScrubbable returns null for non-scrubbable classes", () => {
  assert.equal(parseScrubbable("font-bold"), null);
  assert.equal(parseScrubbable("uppercase"), null);
  assert.equal(parseScrubbable("flex"), null);
});

// --- bumpClass -------------------------------------------------------------

test("bumpClass on mt-8 with +1 goes to mt-9", () => {
  const s = parseScrubbable("mt-8")!;
  assert.equal(bumpClass(s, +1), "mt-9");
});

test("bumpClass on mt-8 with -1 goes to mt-7", () => {
  const s = parseScrubbable("mt-8")!;
  assert.equal(bumpClass(s, -1), "mt-7");
});

test("bumpClass walks Tailwind's non-linear spacing scale past mt-12", () => {
  // The Tailwind scale jumps: ..., 10, 11, 12, 14, 16, 20, 24, 28, 32, ...
  const s = parseScrubbable("mt-12")!;
  assert.equal(bumpClass(s, +1), "mt-14");
});

test("bumpClass on -mt-2 with -1 goes deeper (-mt-3)", () => {
  const s = parseScrubbable("-mt-2")!;
  assert.equal(bumpClass(s, -1), "-mt-3");
});

test("bumpClass on -mt-1 with +1 toward zero returns null (remove the class)", () => {
  const s = parseScrubbable("-mt-1")!;
  assert.equal(bumpClass(s, +1), null);
});

test("bumpClass on mt-1 with -1 toward zero returns null", () => {
  const s = parseScrubbable("mt-1")!;
  assert.equal(bumpClass(s, -1), null);
});

test("bumpClass on text-[44px] +1 goes to text-[45px]", () => {
  const s = parseScrubbable("text-[44px]")!;
  assert.equal(bumpClass(s, +1), "text-[45px]");
});

test("bumpClass on text-[44px] -1 goes to text-[43px]", () => {
  const s = parseScrubbable("text-[44px]")!;
  assert.equal(bumpClass(s, -1), "text-[43px]");
});

test("bumpClass on text-lg +1 goes to text-xl", () => {
  const s = parseScrubbable("text-lg")!;
  assert.equal(bumpClass(s, +1), "text-xl");
});

test("bumpClass on text-lg -1 goes to text-base", () => {
  const s = parseScrubbable("text-lg")!;
  assert.equal(bumpClass(s, -1), "text-base");
});

test("bumpClass on rounded-lg +1 goes to rounded-xl", () => {
  const s = parseScrubbable("rounded-lg")!;
  assert.equal(bumpClass(s, +1), "rounded-xl");
});

test("bumpClass at the top of a named scale clamps (stays at last value)", () => {
  // text-9xl is the top of Tailwind's text-size scale.
  const s = parseScrubbable("text-9xl")!;
  assert.equal(bumpClass(s, +1), "text-9xl");
});

test("bumpClass at the bottom of a named scale clamps", () => {
  // text-xs is the bottom of the text-size scale.
  const s = parseScrubbable("text-xs")!;
  assert.equal(bumpClass(s, -1), "text-xs");
});
