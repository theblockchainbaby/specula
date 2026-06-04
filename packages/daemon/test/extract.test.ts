import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeComponentFile,
  buildModifiedOriginal,
  isValidComponentName,
  runExtract,
} from "../src/extract.js";
import type { MapEntry } from "../src/source-map.js";

const BIN_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../specula-instrument/target/release",
);
const ANALYZE_BIN = join(BIN_DIR, "specula-analyze");

// --- isValidComponentName --------------------------------------------------

test("isValidComponentName accepts a normal Pascal-case name", () => {
  assert.equal(isValidComponentName("Hero"), true);
  assert.equal(isValidComponentName("HeroSection"), true);
  assert.equal(isValidComponentName("MyAwesomeButton123"), true);
});

test("isValidComponentName rejects names that start with a lowercase letter", () => {
  assert.equal(isValidComponentName("hero"), false);
  assert.equal(isValidComponentName("myComponent"), false);
});

test("isValidComponentName rejects names with special characters or whitespace", () => {
  assert.equal(isValidComponentName("Hero-1"), false);
  assert.equal(isValidComponentName("Hero Section"), false);
  assert.equal(isValidComponentName(""), false);
  assert.equal(isValidComponentName("My.Component"), false);
});

// --- composeComponentFile --------------------------------------------------

test("composeComponentFile wraps a single-element body in a function component", () => {
  const out = composeComponentFile("Hero", "<h1>Hello</h1>");
  assert.match(out, /export function Hero/);
  assert.match(out, /return \(/);
  assert.match(out, /<h1>Hello<\/h1>/);
});

test("composeComponentFile re-indents multi-line bodies inside the return", () => {
  // The extracted source comes from inside the original file, so it likely
  // has the original file's indentation. The composer should give it a clean
  // 4-space indent inside the new return.
  const body =
    "<div>\n            <h1>Hello</h1>\n            <p>world</p>\n          </div>";
  const out = composeComponentFile("Hero", body);
  // Result should contain the body with consistent indentation.
  assert.ok(out.includes("<h1>Hello</h1>"));
  assert.ok(out.includes("<p>world</p>"));
  // The wrapping div should be indented under `return (`.
  assert.match(out, /return \(\s*\n\s+<div>/);
});

// --- buildModifiedOriginal -------------------------------------------------

test("buildModifiedOriginal inserts an import and replaces the element with <Name />", () => {
  const original =
    'import { foo } from "./foo";\n\nexport default function Home(){return <main><h1>Hello</h1></main>;}';
  // The h1's byte span — find it via indexOf for the test.
  const elementStart = original.indexOf("<h1>");
  const elementEnd = original.indexOf("</h1>") + "</h1>".length;
  const result = buildModifiedOriginal(
    original,
    elementStart,
    elementEnd,
    "Hero",
    "./components/Hero",
  );
  // Import is added after the existing imports.
  assert.match(result, /import Hero from "\.\/components\/Hero";/);
  // The h1 was replaced with <Hero />.
  assert.match(result, /<main><Hero \/><\/main>/);
  // The original h1 is gone.
  assert.equal(result.includes("<h1>Hello</h1>"), false);
});

test("buildModifiedOriginal puts the new import after the last existing import", () => {
  const original =
    'import { foo } from "./foo";\nimport { bar } from "./bar";\n\nfunction X(){return <h1>Hi</h1>;}';
  const elementStart = original.indexOf("<h1>");
  const elementEnd = original.indexOf("</h1>") + "</h1>".length;
  const result = buildModifiedOriginal(
    original,
    elementStart,
    elementEnd,
    "Greeting",
    "./Greeting",
  );
  const lines = result.split("\n");
  assert.equal(lines[0], 'import { foo } from "./foo";');
  assert.equal(lines[1], 'import { bar } from "./bar";');
  // The new import is right after the existing block.
  assert.equal(lines[2], 'import Greeting from "./Greeting";');
});

// --- runExtract: real integration -----------------------------------------

test("runExtract writes a new component file and modifies the original", async () => {
  const root = mkdtempSync(join(tmpdir(), "specula-extract-"));
  mkdirSync(join(root, "src", "app"), { recursive: true });
  // app router layout for the test fixture — keeps the existsSync check happy
  // so components land in src/components.
  const file = join(root, "src", "app", "page.tsx");
  const source =
    'export default function Home(){return <main><h1>Hello</h1></main>;}';
  writeFileSync(file, source, "utf8");

  // Element span: the <h1>Hello</h1>
  const lo = source.indexOf("<h1>");
  const hi = source.indexOf("</h1>") + "</h1>".length;
  const entry: MapEntry = {
    path: "src/app/page.tsx#Home/main:0/h1:0",
    file: "src/app/page.tsx",
    tag: "h1",
    kind: "host",
    env: "server",
    lo,
    hi,
  };

  try {
    const result = await runExtract(entry, "Hero", {
      analyzeBin: ANALYZE_BIN,
      projectRoot: root,
    });
    assert.equal(result.ok, true);
    assert.equal(result.newFile, join("src", "components", "Hero.tsx"));

    const modified = readFileSync(file, "utf8");
    assert.match(modified, /import Hero from "/);
    assert.match(modified, /<main><Hero \/><\/main>/);

    const newFile = readFileSync(join(root, "src", "components", "Hero.tsx"), "utf8");
    assert.match(newFile, /export function Hero/);
    assert.match(newFile, /<h1>Hello<\/h1>/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runExtract rejects an invalid component name and leaves files untouched", async () => {
  const root = mkdtempSync(join(tmpdir(), "specula-extract-"));
  mkdirSync(join(root, "src", "app"), { recursive: true });
  const file = join(root, "src", "app", "page.tsx");
  const source =
    'export default function Home(){return <main><h1>Hi</h1></main>;}';
  writeFileSync(file, source, "utf8");
  const entry: MapEntry = {
    path: "src/app/page.tsx#Home/main:0/h1:0",
    file: "src/app/page.tsx",
    tag: "h1",
    kind: "host",
    env: "server",
    lo: source.indexOf("<h1>"),
    hi: source.indexOf("</h1>") + "</h1>".length,
  };
  try {
    const result = await runExtract(entry, "lowercase", {
      analyzeBin: ANALYZE_BIN,
      projectRoot: root,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason || "", /invalid component name/);
    // Files unchanged.
    assert.equal(readFileSync(file, "utf8"), source);
    assert.equal(
      existsSync(join(root, "src", "components", "lowercase.tsx")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildModifiedOriginal puts the import at the top when there are no imports", () => {
  const original = "function X(){return <h1>Hi</h1>;}";
  const elementStart = original.indexOf("<h1>");
  const elementEnd = original.indexOf("</h1>") + "</h1>".length;
  const result = buildModifiedOriginal(
    original,
    elementStart,
    elementEnd,
    "Greeting",
    "./Greeting",
  );
  assert.ok(result.startsWith('import Greeting from "./Greeting";\n'));
});
