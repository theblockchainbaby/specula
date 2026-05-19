# specula-instrument

The Specula instrumentation pass — **one path algorithm, two modes** (see
`../specs/identity.md`).

- **`specula-core`** — the path algorithm. `Mode::Transform` injects
  `data-spc` / `data-spc-env` attributes; `Mode::Analyze` emits the source map.
  Both modes run the same code, so the bundler and the daemon can never compute
  paths differently.
- **`specula-swc-plugin`** — a thin `#[plugin_transform]` wrapper over
  `specula-core`, compiled to `wasm32-wasip1` for the bundler.

## Build & test

    cargo test                                                   # conformance suite
    cargo build --target wasm32-wasip1 --release -p specula-swc-plugin

The wasm artifact lands at `target/wasm32-wasip1/release/specula_swc_plugin.wasm`.

## Conformance

`crates/specula-core/tests/conformance.rs` is the contract both modes must
satisfy: basic nesting + indexing, fragment transparency, host vs. component,
`.map()`, conditional branches, static keys, and `"use client"` env detection.

## Pinning

`swc_core` is pinned to `66.0.2`. The SWC plugin ABI must match the host
Next.js build — re-pin deliberately on Next upgrades and re-run the conformance
suite. `Cargo.lock` is committed for reproducible plugin builds.
