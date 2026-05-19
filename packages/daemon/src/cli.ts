/**
 * Daemon CLI entry point — `node cli.ts [projectRoot]`.
 *
 * Binary and bundle paths come from the environment so a `specula dev` wrapper
 * (or a verification harness) can supply the locations it discovered.
 */

import { startSpeculaDaemon } from "./index.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`specula daemon: ${name} is required`);
    process.exit(1);
  }
  return value;
}

const projectRoot = process.argv[2] ?? process.cwd();

const daemon = await startSpeculaDaemon(projectRoot, {
  port: Number(process.env.SPECULA_PORT ?? 5151),
  devOrigin: process.env.SPECULA_DEV_ORIGIN ?? "http://localhost:3000",
  analyzeBin: requireEnv("SPECULA_ANALYZE_BIN"),
  editBin: requireEnv("SPECULA_EDIT_BIN"),
  overlayBundle: process.env.SPECULA_OVERLAY_BUNDLE,
});

console.log(
  `specula daemon listening on http://127.0.0.1:${daemon.port} for ${projectRoot}`,
);
