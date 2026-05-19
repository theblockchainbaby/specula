/**
 * The daemon server — an HTTP server that also carries the WebSocket protocol.
 *
 * Over HTTP it serves `/specula.js` (the overlay bundle, see `http-assets.ts`).
 * Over WebSocket it speaks the intent protocol, behind two guards:
 *  1. Origin — the connection's `Origin` must be an allowed dev-server origin.
 *  2. Token  — the first message must be a `hello` carrying the session token.
 *
 * Together these block a malicious browser tab from driving the daemon.
 */

import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { RawData, WebSocket } from "ws";
import { serveAsset } from "./http-assets.js";
import type { ClientMessage, HelloOk, ServerMessage } from "./protocol.js";

const CLOSE_BAD_MESSAGE = 4400;
const CLOSE_BAD_HANDSHAKE = 4401;
const CLOSE_BAD_ORIGIN = 4403;

export interface DaemonOptions {
  /** TCP port; 0 picks a free one. */
  port: number;
  /** The session token the overlay must present (see `session.ts`). */
  token: string;
  /** Origins allowed to connect — the dev server's origin(s). */
  allowedOrigins: string[];
  /** Project info echoed in `hello-ok`. */
  project: HelloOk["project"];
  /** Handler for authenticated, post-handshake messages. */
  onMessage?: (socket: WebSocket, message: ClientMessage) => void;
  /** Path to the bundled overlay; enables serving `GET /specula.js`. */
  overlayBundle?: string;
}

export interface DaemonHandle {
  port: number;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

/** Start the daemon server. Resolves once it is listening. */
export async function startDaemon(opts: DaemonOptions): Promise<DaemonHandle> {
  const httpServer = createServer((req, res) => {
    const address = httpServer.address() as AddressInfo;
    const handled = serveAsset(req, res, {
      overlayBundle: opts.overlayBundle,
      daemonUrl: `ws://127.0.0.1:${address.port}`,
      token: opts.token,
    });
    if (!handled) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("specula daemon");
    }
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (socket, req) => {
    const origin = req.headers.origin;
    if (origin === undefined || !opts.allowedOrigins.includes(origin)) {
      socket.close(CLOSE_BAD_ORIGIN, "origin not allowed");
      return;
    }

    let authenticated = false;

    socket.on("message", (raw: RawData) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        socket.close(CLOSE_BAD_MESSAGE, "malformed json");
        return;
      }

      if (!authenticated) {
        if (message.type !== "hello" || message.token !== opts.token) {
          socket.close(CLOSE_BAD_HANDSHAKE, "handshake failed");
          return;
        }
        authenticated = true;
        send(socket, {
          v: 1,
          id: message.id,
          type: "hello-ok",
          project: opts.project,
          mapVersion: "0",
        });
        return;
      }

      opts.onMessage?.(socket, message);
    });
  });

  httpServer.listen(opts.port);
  await once(httpServer, "listening");

  return {
    port: (httpServer.address() as AddressInfo).port,
    wss,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        httpServer.closeAllConnections();
        wss.close(() => httpServer.close(() => resolve()));
      }),
  };
}

/** Serialize and send a server message over a socket. */
export function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}
