import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { JSDOM } from "jsdom";
import { hitTest, ladder } from "../src/resolve.js";

function dom(html: string): Document {
  return new JSDOM(html).window.document;
}

test("hitTest finds the nearest instrumented ancestor of a click", () => {
  const document = dom(`
    <main data-spc="page.tsx#Home/main:0" data-spc-env="server">
      <h1 data-spc="page.tsx#Home/main:0/h1:0" data-spc-env="server">
        <span>deep child</span>
      </h1>
    </main>
  `);
  const hit = hitTest(document.querySelector("span")!);
  assert.equal(hit?.path, "page.tsx#Home/main:0/h1:0");
  assert.equal(hit?.env, "server");
});

test("hitTest returns null outside any instrumented subtree", () => {
  const document = dom(`<div><p>uninstrumented</p></div>`);
  assert.equal(hitTest(document.querySelector("p")!), null);
});

test("ladder walks instrumented ancestors, innermost first", () => {
  const document = dom(`
    <main data-spc="page.tsx#Home/main:0" data-spc-env="server">
      <section data-spc="page.tsx#Home/main:0/section:0" data-spc-env="server">
        <p data-spc="page.tsx#Home/main:0/section:0/p:0" data-spc-env="server">x</p>
      </section>
    </main>
  `);
  assert.deepEqual(
    ladder(document.querySelector("p")!).map((rung) => rung.path),
    [
      "page.tsx#Home/main:0/section:0/p:0",
      "page.tsx#Home/main:0/section:0",
      "page.tsx#Home/main:0",
    ],
  );
});

test("instanceIndex distinguishes .map()ed elements that share a path", () => {
  const document = dom(`
    <ul data-spc="list.tsx#List/ul:0" data-spc-env="client">
      <li data-spc="list.tsx#List/ul:0/li:0" data-spc-env="client">a</li>
      <li data-spc="list.tsx#List/ul:0/li:0" data-spc-env="client">b</li>
      <li data-spc="list.tsx#List/ul:0/li:0" data-spc-env="client">c</li>
    </ul>
  `);
  const items = [...document.querySelectorAll("li")];
  assert.equal(hitTest(items[0]!)?.instanceIndex, 0);
  assert.equal(hitTest(items[1]!)?.instanceIndex, 1);
  assert.equal(hitTest(items[2]!)?.instanceIndex, 2);
});

test("hitTest and ladder work on real Next.js plugin output", () => {
  const htmlPath = resolvePath(
    dirname(fileURLToPath(import.meta.url)),
    "../../../apps/playground/.next/server/app/index.html",
  );
  const document = dom(readFileSync(htmlPath, "utf8"));

  const hit = hitTest(document.querySelector("h1")!);
  assert.ok(hit, "the playground <h1> should be instrumented by the plugin");
  assert.match(hit.path, /page\.tsx#Home\/main:0\/h1:0$/);

  // The ladder climbs out of page.tsx into layout.tsx — it crosses files.
  const climbed = ladder(document.querySelector("h1")!).map((r) => r.path);
  assert.ok(climbed.some((p) => p.endsWith("#Home/main:0")));
  assert.ok(climbed.some((p) => p.includes("RootLayout")));
});
