import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { handleSelect } from "../src/select.js";
import { SourceMap } from "../src/source-map.js";
import type { MapEntry } from "../src/source-map.js";
import { startSpeculaDaemon } from "../src/index.js";

const BIN_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../specula-instrument/target/release",
);
const ANALYZE_BIN = join(BIN_DIR, "specula-analyze");
const EDIT_BIN = join(BIN_DIR, "specula-edit");

function entry(path: string, tag: string, extra: Partial<MapEntry> = {}): MapEntry {
  return {
    path,
    file: "page.tsx",
    tag,
    kind: "host",
    env: "server",
    lo: 0,
    hi: 0,
    ...extra,
  };
}

test("handleSelect builds a select-ok with env and the structural ladder", () => {
  const map = new SourceMap();
  map.add([
    entry("page.tsx#Home/main:0", "main"),
    entry("page.tsx#Home/main:0/section:0", "section"),
    entry("page.tsx#Home/main:0/section:0/p:0", "p"),
  ]);

  const reply = handleSelect(map, {
    v: 1,
    id: "s1",
    type: "select",
    selection: { path: "page.tsx#Home/main:0/section:0/p:0", instanceIndex: 0 },
  });

  assert.ok(reply);
  assert.equal(reply.type, "select-ok");
  assert.equal(reply.id, "s1");
  assert.equal(reply.env, "server");
  assert.equal(reply.tier, "A");
  assert.deepEqual(
    reply.ladder.map((rung) => rung.label),
    ["p", "section", "main"],
  );
});

test("handleSelect returns undefined for an unknown path", () => {
  const map = new SourceMap();
  map.add([entry("page.tsx#Home/main:0", "main")]);
  const reply = handleSelect(map, {
    v: 1,
    id: "s2",
    type: "select",
    selection: { path: "page.tsx#Missing/x:0", instanceIndex: 0 },
  });
  assert.equal(reply, undefined);
});

test("handleSelect fills editable with the element's text and classes", () => {
  const map = new SourceMap();
  map.add([
    entry("page.tsx#E/h1:0", "h1", {
      text: "Title",
      className: "text-xl font-bold",
    }),
  ]);
  const reply = handleSelect(map, {
    v: 1,
    id: "s3",
    type: "select",
    selection: { path: "page.tsx#E/h1:0", instanceIndex: 0 },
  });
  assert.ok(reply);
  assert.deepEqual(reply.editable.text, { value: "Title", isDynamic: false });
  assert.deepEqual(reply.editable.classes, { base: ["text-xl", "font-bold"] });
});

test("the daemon answers a select request end to end", { timeout: 20000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "specula-select-e2e-"));
  mkdirSync(join(root, "app"));
  const pageFile = join(root, "app", "page.tsx");
  writeFileSync(
    pageFile,
    "export default function Home(){return <main><h1>Hi</h1></main>;}",
  );
  // The canonical path the overlay would send — project-relative, as the
  // SWC plugin emits it into data-spc.
  const pagePath = relative(root, pageFile);

  const daemon = await startSpeculaDaemon(root, {
    devOrigin: "http://localhost:3000",
    analyzeBin: ANALYZE_BIN,
    editBin: EDIT_BIN,
  });

  const nextMessage = (socket: WebSocket): Promise<Record<string, unknown>> =>
    new Promise((res) =>
      socket.once("message", (data) =>
        res(JSON.parse(data.toString()) as Record<string, unknown>),
      ),
    );

  try {
    const socket = new WebSocket(`ws://127.0.0.1:${daemon.port}`, {
      origin: "http://localhost:3000",
    });
    socket.on("error", () => {});

    const helloOk = nextMessage(socket);
    await once(socket, "open");
    socket.send(
      JSON.stringify({
        v: 1,
        id: "h1",
        type: "hello",
        token: daemon.token,
        client: "overlay",
      }),
    );
    await helloOk;

    const selectOk = nextMessage(socket);
    socket.send(
      JSON.stringify({
        v: 1,
        id: "sel1",
        type: "select",
        selection: {
          path: `${pagePath}#Home/main:0/h1:0`,
          instanceIndex: 0,
        },
      }),
    );
    const reply = await selectOk;

    assert.equal(reply.type, "select-ok");
    assert.equal(reply.id, "sel1");
    assert.equal(reply.env, "server");
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});
