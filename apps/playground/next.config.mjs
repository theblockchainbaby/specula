import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Absolute path to the Specula SWC plugin wasm artifact. Absolute paths are
// safe under Webpack (the v1 runtime); Turbopack issue #78156 breaks them,
// which is one reason v1 ships Webpack-first.
const speculaPlugin = resolve(
  here,
  "../../specula-instrument/target/wasm32-wasip1/release/specula_swc_plugin.wasm",
);

/** @type {import('next').NextConfig} */
export default {
  experimental: {
    // `root` is this project's directory: the plugin strips it from each
    // file's absolute path so `data-spc` ids are project-relative — no
    // author home directory leaks into shipped HTML, and the ids match the
    // daemon's source-map keys on any machine.
    swcPlugins: [[speculaPlugin, { root: here }]],
  },
};
