// Resolve the playground's `next` entry script through the playground's own
// module resolution — found whether npm hoisted it to the workspace root or
// nested it locally. Spawn it with `process.execPath` (it is a JS entry, not
// a shell shim). Mirrors the resolution `packages/cli/src/dev.mjs` uses for
// external projects.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export function resolveNextBin(projectDir) {
  const projectRequire = createRequire(join(projectDir, "package.json"));
  const pkgPath = projectRequire.resolve("next/package.json");
  const pkg = projectRequire(pkgPath);
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.next;
  if (!bin) throw new Error(`next resolved at ${pkgPath} has no bin entry`);
  return join(dirname(pkgPath), bin);
}
