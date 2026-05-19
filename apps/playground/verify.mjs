// Build-output verification — asserts the Specula SWC plugin instrumented the
// prerendered HTML with project-relative `data-spc` ids. Run via
// `npm run verify` (builds, then checks).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  resolve(here, ".next/server/app/index.html"),
  "utf8",
);

// `data-spc` ids are project-relative: the SWC plugin strips the project root
// (passed as plugin config in next.config.mjs) so no absolute author path is
// ever shipped in HTML — see specs/identity.md.
const expected = [
  "app/layout.tsx#RootLayout/html:0",
  "app/layout.tsx#RootLayout/html:0/body:0",
  "app/page.tsx#Home/main:0",
  "app/page.tsx#Home/main:0/h1:0",
  "app/page.tsx#Home/main:0/section:0",
  "app/page.tsx#Home/main:0/section:0/p:0",
  "app/page.tsx#Home/main:0/section:0/p:0/code:0",
];

const found = [...html.matchAll(/data-spc="([^"]*)"/g)].map((m) => m[1]);

const missing = expected.filter((path) => !found.includes(path));
if (missing.length > 0) {
  console.error("FAIL — prerendered HTML is missing data-spc for:");
  for (const path of missing) console.error("  " + path);
  process.exit(1);
}

// Core trust check: no id may be an absolute path. An absolute path would
// leak the author's filesystem into shipped HTML and break the cross-machine
// identity the daemon depends on.
const absolute = found.filter((value) => value.startsWith("/"));
if (absolute.length > 0) {
  console.error("FAIL — absolute data-spc paths leaked into the HTML:");
  for (const value of absolute) console.error("  " + value);
  process.exit(1);
}

if (!html.includes('data-spc-env="server"')) {
  console.error("FAIL — no data-spc-env attribute in prerendered HTML");
  process.exit(1);
}

console.log(
  `PASS — ${found.length} project-relative data-spc attributes in prerendered HTML`,
);
