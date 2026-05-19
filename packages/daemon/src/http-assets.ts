/**
 * HTTP asset serving — the daemon serves the overlay so a dev page can load it
 * with a single `<script>` tag.
 *
 * `GET /specula.js` returns the overlay bundle plus a bootstrap that calls
 * `startOverlay` with the daemon URL and session token baked in — so the
 * token handshake needs no separate fetch.
 */

import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface AssetConfig {
  /** Path to the bundled overlay (`dist/overlay.js`); unset disables serving. */
  overlayBundle?: string;
  /** Daemon WebSocket URL baked into the bootstrap. */
  daemonUrl: string;
  /** Session token baked into the bootstrap. */
  token: string;
}

/**
 * Serve a daemon HTTP request. Returns `true` if it produced a response, so
 * the caller can 404 anything else.
 */
export function serveAsset(
  req: IncomingMessage,
  res: ServerResponse,
  config: AssetConfig,
): boolean {
  const path = (req.url ?? "").split("?")[0];
  if (path !== "/specula.js") return false;

  if (!config.overlayBundle) {
    res.writeHead(503, jsHeaders());
    res.end("// specula: overlay bundle not configured");
    return true;
  }

  let bundle: string;
  try {
    bundle = readFileSync(config.overlayBundle, "utf8");
  } catch {
    res.writeHead(503, jsHeaders());
    res.end("// specula: overlay bundle not found — run `npm run build`");
    return true;
  }

  const config_json = JSON.stringify({
    daemonUrl: config.daemonUrl,
    token: config.token,
  });
  const bootstrap = `\n;window.__specula = SpeculaOverlay.startOverlay(${config_json});\n`;

  res.writeHead(200, jsHeaders());
  res.end(bundle + bootstrap);
  return true;
}

function jsHeaders(): Record<string, string> {
  return {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
  };
}
