/**
 * Session identity. A localhost WebSocket is reachable by any page in the
 * browser; the daemon mints a per-session token that the overlay must present
 * on connect, and the server rejects anything else (see `server.ts`).
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** A fresh 256-bit session token, hex-encoded. */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Persist the session (token + daemon port) to `<root>/.specula/session`,
 * where the injected overlay reads it. Returns the path written.
 */
export function persistSession(
  projectRoot: string,
  token: string,
  port: number,
): string {
  const file = join(projectRoot, ".specula", "session");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ token, port }, null, 2)}\n`, "utf8");
  return file;
}
