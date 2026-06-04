import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { applyEdit } from "../src/edit.js";
import { runEdit } from "../src/apply-edit.js";
import { FileQueue } from "../src/file-queue.js";
import { startSpeculaDaemon } from "../src/index.js";

const BIN_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../specula-instrument/target/release",
);
const EDIT_BIN = join(BIN_DIR, "specula-edit");
const ANALYZE_BIN = join(BIN_DIR, "specula-analyze");

const PAGE =
  'export default function Home(){return <main><h1 className="text-sm">Old heading</h1></main>;}';

/** Edit options for a transaction rooted at `projectRoot`. */
function deps(projectRoot: string) {
  return {
    editBin: EDIT_BIN,
    analyzeBin: ANALYZE_BIN,
    queue: new FileQueue(),
    projectRoot,
  };
}

test("applyEdit rewrites text for edit-text", async () => {
  const result = await applyEdit(
    EDIT_BIN,
    "page.tsx",
    PAGE,
    "edit-text",
    "page.tsx#Home/main:0/h1:0",
    "New heading",
  );
  assert.equal(result.ok, true);
  assert.match(result.source ?? "", /New heading/);
});

test("applyEdit rewrites the class string for set-class", async () => {
  const result = await applyEdit(
    EDIT_BIN,
    "page.tsx",
    PAGE,
    "set-class",
    "page.tsx#Home/main:0/h1:0",
    "text-lg font-bold",
  );
  assert.equal(result.ok, true);
  assert.match(result.source ?? "", /text-lg font-bold/);
});

test("applyEdit reports ok:false for an unknown target", async () => {
  const result = await applyEdit(
    EDIT_BIN,
    "page.tsx",
    PAGE,
    "edit-text",
    "page.tsx#Home/main:0/h9:0",
    "x",
  );
  assert.equal(result.ok, false);
});

test("runEdit commits a real edit-text to the file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "specula-edit-tx-"));
  const file = join(dir, "page.tsx");
  writeFileSync(file, PAGE, "utf8");
  try {
    // `runEdit` takes the project-relative path; `deps` carries the root.
    const result = await runEdit(
      "page.tsx",
      "edit-text",
      "page.tsx#Home/main:0/h1:0",
      "Committed heading",
      deps(dir),
    );
    assert.equal(result.ok, true);
    // Minimal diff: only the heading text changed, every other byte preserved.
    assert.equal(
      readFileSync(file, "utf8"),
      PAGE.replace("Old heading", "Committed heading"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runEdit commits a real set-class to the file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "specula-edit-tx-"));
  const file = join(dir, "page.tsx");
  writeFileSync(file, PAGE, "utf8");
  try {
    const result = await runEdit(
      "page.tsx",
      "set-class",
      "page.tsx#Home/main:0/h1:0",
      "text-lg font-bold",
      deps(dir),
    );
    assert.equal(result.ok, true);
    assert.match(readFileSync(file, "utf8"), /className="text-lg font-bold"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runEdit commits a toggle-conditional that flips the test", async () => {
  const dir = mkdtempSync(join(tmpdir(), "specula-edit-tx-"));
  const file = join(dir, "page.tsx");
  const conditional =
    "export default function Home({show}){return <main>{show && <h1>x</h1>}</main>;}";
  writeFileSync(file, conditional, "utf8");
  try {
    const result = await runEdit(
      "page.tsx",
      "toggle-conditional",
      "page.tsx#Home/main:0/h1:0",
      "",
      deps(dir),
    );
    assert.equal(result.ok, true);
    assert.equal(
      readFileSync(file, "utf8"),
      "export default function Home({show}){return <main>{!show && <h1>x</h1>}</main>;}",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runEdit commits an unwrap that removes the wrapping element", async () => {
  const dir = mkdtempSync(join(tmpdir(), "specula-edit-tx-"));
  const file = join(dir, "page.tsx");
  // Fixture: a <div> wrapping an <h1>. Unwrap should leave only the <h1>.
  const wrapped =
    "export default function Home(){return <main><div><h1>x</h1></div></main>;}";
  writeFileSync(file, wrapped, "utf8");
  try {
    const result = await runEdit(
      "page.tsx",
      "unwrap",
      "page.tsx#Home/main:0/div:0",
      "",
      deps(dir),
    );
    assert.equal(result.ok, true);
    assert.equal(
      readFileSync(file, "utf8"),
      "export default function Home(){return <main><h1>x</h1></main>;}",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runEdit rolls the file back when the target is not found", async () => {
  const dir = mkdtempSync(join(tmpdir(), "specula-edit-tx-"));
  const file = join(dir, "page.tsx");
  writeFileSync(file, PAGE, "utf8");
  try {
    const result = await runEdit(
      "page.tsx",
      "edit-text",
      "page.tsx#Home/main:0/h9:0",
      "should not land",
      deps(dir),
    );
    assert.equal(result.ok, false);
    assert.equal(readFileSync(file, "utf8"), PAGE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- end-to-end over the WebSocket -----------------------------------------

interface MessageStream {
  /** The next protocol message, in arrival order. */
  next(): Promise<Record<string, unknown>>;
}

/** Buffer every message so sequential awaits never race against arrival. */
function messageStream(socket: WebSocket): MessageStream {
  const buffer: Record<string, unknown>[] = [];
  const waiters: ((message: Record<string, unknown>) => void)[] = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else buffer.push(message);
  });
  return {
    next() {
      const buffered = buffer.shift();
      return buffered
        ? Promise.resolve(buffered)
        : new Promise((res) => waiters.push(res));
    },
  };
}

async function bootAndHandshake(root: string) {
  const daemon = await startSpeculaDaemon(root, {
    devOrigin: "http://localhost:3000",
    analyzeBin: ANALYZE_BIN,
    editBin: EDIT_BIN,
  });
  const socket = new WebSocket(`ws://127.0.0.1:${daemon.port}`, {
    origin: "http://localhost:3000",
  });
  socket.on("error", () => {});
  const stream = messageStream(socket);
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
  assert.equal((await stream.next()).type, "hello-ok");
  return { daemon, socket, stream };
}

/**
 * A throwaway project holding one page. `pageFile` is the absolute path (for
 * disk assertions); `pagePath` is the canonical project-relative path the
 * daemon keys its map by — what the overlay sends in intents.
 */
function projectWith(source: string): {
  root: string;
  pageFile: string;
  pagePath: string;
} {
  const root = mkdtempSync(join(tmpdir(), "specula-intent-"));
  mkdirSync(join(root, "app"));
  const pageFile = join(root, "app", "page.tsx");
  writeFileSync(pageFile, source, "utf8");
  return { root, pageFile, pagePath: relative(root, pageFile) };
}

test("an edit-text intent acks optimistically then commits", { timeout: 20000 }, async () => {
  const { root, pageFile, pagePath } = projectWith(PAGE);
  const { daemon, socket, stream } = await bootAndHandshake(root);
  try {
    socket.send(
      JSON.stringify({
        v: 1,
        id: "edit1",
        type: "intent",
        verb: "edit-text",
        selection: { path: `${pagePath}#Home/main:0/h1:0`, instanceIndex: 0 },
        text: "Edited through the daemon",
      }),
    );

    // Tier A: the optimistic ack arrives first, carrying the DOM mutation.
    const ack = await stream.next();
    assert.equal(ack.type, "intent-ack");
    assert.equal(ack.tier, "A");
    assert.deepEqual(ack.optimistic, {
      kind: "text",
      path: `${pagePath}#Home/main:0/h1:0`,
      instanceIndex: 0,
      text: "Edited through the daemon",
    });

    // The real edit follows.
    assert.equal((await stream.next()).type, "intent-committed");
    assert.match(readFileSync(pageFile, "utf8"), /Edited through the daemon/);
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a set-class intent acks then commits", { timeout: 20000 }, async () => {
  const { root, pageFile, pagePath } = projectWith(PAGE);
  const { daemon, socket, stream } = await bootAndHandshake(root);
  try {
    socket.send(
      JSON.stringify({
        v: 1,
        id: "class1",
        type: "intent",
        verb: "set-class",
        selection: { path: `${pagePath}#Home/main:0/h1:0`, instanceIndex: 0 },
        state: {},
        add: ["font-bold"],
        remove: [],
      }),
    );
    const ack = await stream.next();
    assert.equal(ack.type, "intent-ack");
    // The optimistic class mutation carries the tailwind-merged result.
    assert.equal((ack.optimistic as { kind: string }).kind, "class");
    assert.equal((await stream.next()).type, "intent-committed");
    const written = readFileSync(pageFile, "utf8");
    assert.match(written, /text-sm/);
    assert.match(written, /font-bold/);
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a replace-asset intent acks then commits", { timeout: 20000 }, async () => {
  const { root, pageFile, pagePath } = projectWith(
    'export default function Home(){return <main><img src="/old.png" /></main>;}',
  );
  const { daemon, socket, stream } = await bootAndHandshake(root);
  try {
    socket.send(
      JSON.stringify({
        v: 1,
        id: "asset1",
        type: "intent",
        verb: "replace-asset",
        selection: { path: `${pagePath}#Home/main:0/img:0`, instanceIndex: 0 },
        asset: {
          name: "new.png",
          dataBase64: Buffer.from("png-bytes").toString("base64"),
        },
      }),
    );
    assert.equal((await stream.next()).type, "intent-ack");
    assert.equal((await stream.next()).type, "intent-committed");
    assert.match(readFileSync(pageFile, "utf8"), /src="\/new\.png"/);
    assert.ok(existsSync(join(root, "public", "new.png")));
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a diverging reconcile-observe yields an intent-warning", { timeout: 20000 }, async () => {
  const { root, pagePath } = projectWith(PAGE);
  const { daemon, socket, stream } = await bootAndHandshake(root);
  const path = `${pagePath}#Home/main:0/h1:0`;
  try {
    socket.send(
      JSON.stringify({
        v: 1,
        id: "edit2",
        type: "intent",
        verb: "edit-text",
        selection: { path, instanceIndex: 0 },
        text: "Intended text",
      }),
    );
    assert.equal((await stream.next()).type, "intent-ack");
    assert.equal((await stream.next()).type, "intent-committed");

    // Report a DIFFERENT text than was intended — the daemon must warn.
    socket.send(
      JSON.stringify({
        v: 1,
        id: "obs1",
        type: "reconcile-observe",
        txId: "edit2",
        observed: { kind: "text", path, instanceIndex: 0, text: "Something else" },
      }),
    );
    const warning = await stream.next();
    assert.equal(warning.type, "intent-warning");
    assert.equal(warning.reason, "reconcile-divergence");
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a delete intent removes the element from source", { timeout: 20000 }, async () => {
  const { root, pageFile, pagePath } = projectWith(PAGE);
  const { daemon, socket, stream } = await bootAndHandshake(root);
  try {
    socket.send(
      JSON.stringify({
        v: 1,
        id: "del1",
        type: "intent",
        verb: "delete",
        selection: { path: `${pagePath}#Home/main:0/h1:0`, instanceIndex: 0 },
      }),
    );
    const ack = await stream.next();
    assert.equal(ack.type, "intent-ack");
    // Structural edits are Tier B — no optimistic patch.
    assert.equal(ack.tier, "B");
    assert.equal(ack.optimistic, undefined);
    assert.equal((await stream.next()).type, "intent-committed");
    assert.doesNotMatch(readFileSync(pageFile, "utf8"), /<h1/);
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a wrap intent encloses the element in a tag", { timeout: 20000 }, async () => {
  const { root, pageFile, pagePath } = projectWith(PAGE);
  const { daemon, socket, stream } = await bootAndHandshake(root);
  try {
    socket.send(
      JSON.stringify({
        v: 1,
        id: "wrap1",
        type: "intent",
        verb: "wrap",
        tag: "div",
        selection: { path: `${pagePath}#Home/main:0/h1:0`, instanceIndex: 0 },
      }),
    );
    assert.equal((await stream.next()).type, "intent-ack");
    assert.equal((await stream.next()).type, "intent-committed");
    // wrap lays the element out on its own lines.
    assert.match(readFileSync(pageFile, "utf8"), /<div>\s+<h1/);
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a move intent swaps two siblings", { timeout: 20000 }, async () => {
  const { root, pageFile, pagePath } = projectWith(
    "export default function Home(){return <main><h1>A</h1><p>B</p></main>;}",
  );
  const { daemon, socket, stream } = await bootAndHandshake(root);
  try {
    socket.send(
      JSON.stringify({
        v: 1,
        id: "move1",
        type: "intent",
        verb: "move",
        selection: { path: `${pagePath}#Home/main:0/h1:0`, instanceIndex: 0 },
        sibling: { path: `${pagePath}#Home/main:0/p:0`, instanceIndex: 0 },
      }),
    );
    assert.equal((await stream.next()).type, "intent-ack");
    assert.equal((await stream.next()).type, "intent-committed");
    assert.match(
      readFileSync(pageFile, "utf8"),
      /<main><p>B<\/p><h1>A<\/h1><\/main>/,
    );
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a set-style intent lowers to a Tailwind arbitrary-property class", { timeout: 20000 }, async () => {
  const { root, pageFile, pagePath } = projectWith(PAGE);
  const { daemon, socket, stream } = await bootAndHandshake(root);
  try {
    socket.send(
      JSON.stringify({
        v: 1,
        id: "style1",
        type: "intent",
        verb: "set-style",
        selection: { path: `${pagePath}#Home/main:0/h1:0`, instanceIndex: 0 },
        state: {},
        property: "padding",
        value: "16px",
      }),
    );
    const ack = await stream.next();
    assert.equal(ack.type, "intent-ack");
    // set-style lowers to set-class — a Tier-A, optimistically-patched edit.
    assert.equal(ack.tier, "A");
    assert.equal((await stream.next()).type, "intent-committed");
    assert.match(readFileSync(pageFile, "utf8"), /\[padding:16px\]/);
    socket.close();
  } finally {
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});
