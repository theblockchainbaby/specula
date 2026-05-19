import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyzeFile, SourceMap } from "../src/source-map.js";

const here = dirname(fileURLToPath(import.meta.url));
// repo-root/specula-instrument/target/release/specula-analyze
const ANALYZE_BIN = resolve(
  here,
  "../../../specula-instrument/target/release/specula-analyze",
);

const SOURCE = `export default function Home() {
  return (
    <main>
      <h1>Title</h1>
      <section>
        <p>Body</p>
      </section>
    </main>
  );
}
`;

test("analyzeFile spawns specula-analyze and returns the map", async () => {
  const entries = await analyzeFile(ANALYZE_BIN, "app/page.tsx", SOURCE);
  assert.deepEqual(
    entries.map((e) => e.path).sort(),
    [
      "app/page.tsx#Home/main:0",
      "app/page.tsx#Home/main:0/h1:0",
      "app/page.tsx#Home/main:0/section:0",
      "app/page.tsx#Home/main:0/section:0/p:0",
    ],
  );
  const main = entries.find((e) => e.path.endsWith("/main:0"));
  assert.equal(main?.kind, "host");
  assert.equal(main?.env, "server");
});

test("SourceMap.resolve returns the entry at a path", async () => {
  const map = new SourceMap();
  map.add(await analyzeFile(ANALYZE_BIN, "app/page.tsx", SOURCE));
  assert.equal(map.size, 4);
  assert.equal(map.resolve("app/page.tsx#Home/main:0/h1:0")?.tag, "h1");
  assert.equal(map.resolve("app/page.tsx#Home/nonexistent:0"), undefined);
});

test("SourceMap.ladder walks the structural ancestors within a file", async () => {
  const map = new SourceMap();
  map.add(await analyzeFile(ANALYZE_BIN, "app/page.tsx", SOURCE));
  assert.deepEqual(
    map.ladder("app/page.tsx#Home/main:0/section:0/p:0").map((e) => e.path),
    [
      "app/page.tsx#Home/main:0/section:0/p:0",
      "app/page.tsx#Home/main:0/section:0",
      "app/page.tsx#Home/main:0",
    ],
  );
});

test("analyzeFile rejects when the source does not parse", async () => {
  await assert.rejects(
    analyzeFile(ANALYZE_BIN, "broken.tsx", "export default function ("),
    /specula-analyze|parse/i,
  );
});
