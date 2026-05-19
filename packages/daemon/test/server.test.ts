import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { startDaemon } from "../src/server.js";
import type { DaemonHandle, DaemonOptions } from "../src/server.js";

const ORIGIN = "http://localhost:3000";
const TOKEN = "test-session-token";
const PROJECT = { framework: "next", styleSystem: "tailwind", root: "/tmp/x" };

async function withDaemon(
  onMessage: DaemonOptions["onMessage"],
  body: (handle: DaemonHandle) => Promise<void>,
): Promise<void> {
  const handle = await startDaemon({
    port: 0,
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    project: PROJECT,
    onMessage,
  });
  try {
    await body(handle);
  } finally {
    await handle.close();
  }
}

/** Open a client socket with an `Origin` header and a swallowed error event. */
function connect(port: number, origin: string): WebSocket {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  socket.on("error", () => {});
  return socket;
}

function closeCode(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once("close", (code) => resolve(code)));
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    socket.once("message", (data) =>
      resolve(JSON.parse(data.toString()) as Record<string, unknown>),
    ),
  );
}

test("rejects a connection from a disallowed origin", { timeout: 5000 }, async () => {
  await withDaemon(undefined, async (handle) => {
    const socket = connect(handle.port, "http://evil.example");
    const code = closeCode(socket);
    assert.equal(await code, 4403);
  });
});

test("rejects a handshake carrying the wrong token", { timeout: 5000 }, async () => {
  await withDaemon(undefined, async (handle) => {
    const socket = connect(handle.port, ORIGIN);
    const code = closeCode(socket);
    await once(socket, "open");
    socket.send(
      JSON.stringify({
        v: 1,
        id: "1",
        type: "hello",
        token: "wrong-token",
        client: "overlay",
      }),
    );
    assert.equal(await code, 4401);
  });
});

test("accepts a valid handshake and replies hello-ok", { timeout: 5000 }, async () => {
  await withDaemon(undefined, async (handle) => {
    const socket = connect(handle.port, ORIGIN);
    const reply = nextMessage(socket);
    await once(socket, "open");
    socket.send(
      JSON.stringify({
        v: 1,
        id: "h1",
        type: "hello",
        token: TOKEN,
        client: "overlay",
      }),
    );
    const message = await reply;
    assert.equal(message.type, "hello-ok");
    assert.equal(message.id, "h1");
    socket.close();
  });
});

test("routes authenticated messages to onMessage", { timeout: 5000 }, async () => {
  let resolveReceived: (message: Record<string, unknown>) => void = () => {};
  const received = new Promise<Record<string, unknown>>((resolve) => {
    resolveReceived = resolve;
  });

  await withDaemon(
    (_socket, message) =>
      resolveReceived(message as unknown as Record<string, unknown>),
    async (handle) => {
      const socket = connect(handle.port, ORIGIN);
      const helloReply = nextMessage(socket);
      await once(socket, "open");
      socket.send(
        JSON.stringify({
          v: 1,
          id: "h1",
          type: "hello",
          token: TOKEN,
          client: "overlay",
        }),
      );
      await helloReply;
      socket.send(
        JSON.stringify({
          v: 1,
          id: "s1",
          type: "select",
          selection: { path: "page.tsx#Home/main:0", instanceIndex: 0 },
        }),
      );
      const message = await received;
      assert.equal(message.type, "select");
      assert.equal(message.id, "s1");
      socket.close();
    },
  );
});

test("serves /specula.js with the overlay bundle and a token bootstrap", { timeout: 5000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "specula-bundle-"));
  const bundlePath = join(dir, "overlay.js");
  writeFileSync(bundlePath, "/* OVERLAY BUNDLE MARKER */", "utf8");

  const handle = await startDaemon({
    port: 0,
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    project: PROJECT,
    overlayBundle: bundlePath,
  });
  try {
    const response = await fetch(`http://127.0.0.1:${handle.port}/specula.js`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /OVERLAY BUNDLE MARKER/);
    assert.match(body, /startOverlay/);
    assert.ok(body.includes(TOKEN), "the bootstrap bakes in the session token");
  } finally {
    await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("404s an unknown HTTP path", { timeout: 5000 }, async () => {
  const handle = await startDaemon({
    port: 0,
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    project: PROJECT,
  });
  try {
    const response = await fetch(`http://127.0.0.1:${handle.port}/nope`);
    assert.equal(response.status, 404);
  } finally {
    await handle.close();
  }
});
