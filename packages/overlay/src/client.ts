/**
 * The overlay's WebSocket client to the daemon.
 *
 * Browser-only — depends on the `WebSocket` global. The handshake it performs
 * is the client side of the one verified in the daemon's `server.test.ts`.
 */

/** A live connection to the daemon. */
export interface DaemonConnection {
  /** Send a protocol message (intent, select, reconcile-observe, …). */
  send(message: unknown): void;
  close(): void;
}

/** The daemon connection lifecycle, for the overlay's connection indicator. */
export type ConnectionState = "connecting" | "open" | "closed";

/**
 * Connect to the daemon and complete the `hello` handshake. `onMessage`
 * receives every server message after the handshake; `onStatus` reports the
 * connection lifecycle so the overlay can show whether the daemon is live.
 */
export function connect(
  url: string,
  token: string,
  onMessage: (message: unknown) => void,
  onStatus: (state: ConnectionState) => void = () => {},
): DaemonConnection {
  const socket = new WebSocket(url);
  onStatus("connecting");

  socket.addEventListener("open", () => {
    onStatus("open");
    socket.send(
      JSON.stringify({
        v: 1,
        id: crypto.randomUUID(),
        type: "hello",
        token,
        client: "overlay",
      }),
    );
  });

  // A dropped or refused socket both mean the daemon is unreachable.
  socket.addEventListener("close", () => onStatus("closed"));
  socket.addEventListener("error", () => onStatus("closed"));

  socket.addEventListener("message", (event) => {
    try {
      onMessage(JSON.parse(String(event.data)));
    } catch {
      /* ignore malformed frames */
    }
  });

  return {
    send: (message) => socket.send(JSON.stringify(message)),
    close: () => socket.close(),
  };
}
