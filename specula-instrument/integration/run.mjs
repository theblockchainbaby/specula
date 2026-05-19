// Isolation test — drive the Specula SWC plugin through @swc/core (a real SWC
// host) and confirm `data-spc` attributes are injected. This isolates "does
// the plugin's ABI + behavior work" from "does the version match Next.js".

import { transform } from "@swc/core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const wasm = resolve(
  here,
  "../target/wasm32-wasip1/release/specula_swc_plugin.wasm",
);

const code = `export default function Page() {
  return (
    <main>
      <h1>Hello</h1>
      <section>
        <p>World</p>
      </section>
    </main>
  );
}
`;

// SWC compiles JSX to `createElement`/`jsx` calls, so the injected attribute
// appears as an object property — `"data-spc": "<path>"`. React forwards
// `data-*` props to the DOM, so it still becomes a real HTML attribute at
// render time (which the Next.js build test asserts separately).
function transformWith(filename, pluginConfig) {
  return transform(code, {
    filename,
    jsc: {
      parser: { syntax: "typescript", tsx: true },
      target: "es2022",
      experimental: { plugins: [[wasm, pluginConfig]] },
    },
  });
}

// --- Pass 1: no plugin config — the filename passes through unchanged. ------
const plain = await transformWith("app/page.tsx", {});
console.log("--- transformed output (no root) ---");
console.log(plain.code);
console.log("------------------------------------");

const expected = [
  "app/page.tsx#Page/main:0",
  "app/page.tsx#Page/main:0/h1:0",
  "app/page.tsx#Page/main:0/section:0",
  "app/page.tsx#Page/main:0/section:0/p:0",
];
const missing = expected.filter(
  (path) => !plain.code.includes(`"data-spc": "${path}"`),
);
if (missing.length > 0) {
  console.error("FAIL — missing data-spc for:", missing);
  process.exit(1);
}
if (!plain.code.includes('"data-spc-env": "server"')) {
  console.error("FAIL — missing data-spc-env attribute");
  process.exit(1);
}
console.log("PASS — plugin injected every data-spc attribute via @swc/core");

// --- Pass 2: a `root` plugin config — the plugin must strip it. ------------
// This exercises the real host→plugin config channel
// (`get_transform_plugin_config`), which the off-wasm Rust unit tests for
// `project_relative` cannot reach. The result must be project-relative with
// no absolute path leaked.
const rooted = await transformWith("/abs/project/app/page.tsx", {
  root: "/abs/project",
});
if (!rooted.code.includes('"data-spc": "app/page.tsx#Page/main:0"')) {
  console.error("FAIL — plugin did not strip the project root from data-spc");
  console.error(rooted.code);
  process.exit(1);
}
if (rooted.code.includes("/abs/project/app/page.tsx")) {
  console.error("FAIL — absolute path leaked into data-spc despite root config");
  process.exit(1);
}
console.log("PASS — plugin strips the project root when configured");
