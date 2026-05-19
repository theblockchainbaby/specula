import { test } from "node:test";
import assert from "node:assert/strict";
import { computeClassName, statePrefix } from "../src/class-merge.js";

test("statePrefix builds the Tailwind variant prefix", () => {
  assert.equal(statePrefix({}), "");
  assert.equal(statePrefix({ variant: "hover" }), "hover:");
  assert.equal(
    statePrefix({ scheme: "dark", breakpoint: "md", variant: "hover" }),
    "dark:md:hover:",
  );
});

test("computeClassName adds classes for the base state", () => {
  const result = computeClassName("p-4", {}, ["font-bold"], []).split(" ");
  assert.ok(result.includes("p-4"));
  assert.ok(result.includes("font-bold"));
});

test("computeClassName removes classes", () => {
  const result = computeClassName("p-4 font-bold", {}, [], ["font-bold"]);
  assert.equal(result, "p-4");
});

test("computeClassName resolves conflicts last-wins via tailwind-merge", () => {
  // Adding p-6 to a p-4 element must drop the conflicting p-4.
  const result = computeClassName("p-4 text-sm", {}, ["p-6"], []).split(" ");
  assert.ok(result.includes("p-6"));
  assert.ok(result.includes("text-sm"));
  assert.ok(!result.includes("p-4"), `p-4 should be dropped: ${result.join(" ")}`);
});

test("computeClassName prefixes added classes for the style state", () => {
  const result = computeClassName("p-4", { variant: "hover" }, ["bg-blue-500"], []);
  assert.ok(result.split(" ").includes("hover:bg-blue-500"), result);
});
