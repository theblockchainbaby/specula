# Known limitations

Specula v1 is deliberately narrow. The guiding rule is the invariant in the
[README](../README.md): a tool that does a few things without silent failure
beats a tool that does many things with a 5% silent-failure rate. This page is
the honest list of what v1 does **not** do, and where each item is headed.

## Scope

**Webpack only.** v1 runs under the Next.js Webpack dev runtime
(`next dev --webpack`). Turbopack — the Next.js 16 default — is blocked by two
open tickets: [#78156](https://github.com/vercel/next.js/issues/78156) (a crash
when SWC plugins are configured by absolute path) and
[#78181](https://github.com/vercel/next.js/issues/78181) (the plugin's
`Filename` metadata returns only the basename). The instrumentation crate is
bundler-agnostic; the default flips when the tickets close — no rewrite.

**Next.js 16 App Router + Tailwind.** The identity algorithm is RSC-aware for
the App Router. The Pages Router, non-Next frameworks, and non-Tailwind styling
systems are out of scope for v1.

**Direct manipulation only.** v1 has no AI agent. The protocol reserves an
agent tier (Tier D), but v1 is the direct click-to-source foundation — get that
loop trustworthy first.

## Distribution

**Not published to npm.** v1 runs from the cloned repository. Using Specula in
your own project means pointing `next.config` at the built wasm artifact inside
this repo by path (see the [README](../README.md)). Publishing to npm with
prebuilt platform binaries is the headline v1.1 task.

**A Rust toolchain is required.** The SWC plugin and the `analyze` / `edit`
binaries build from source — there are no prebuilt binaries. `npm run setup`
needs `cargo` and the `wasm32-wasip1` target. The bundled demo is the only path
that needs no further setup once built.

## Verification depth

**Parse gate + reconcile, not the full gate set.** Every transaction runs the
parse gate (the rewritten file must still parse as valid TSX) and, for Tier A,
the reconcile check (the re-rendered result is compared to the optimistic
patch). The **render gate** and the **post-commit typecheck** that
[`specs/verification.md`](../specs/verification.md) describes are not yet wired:
a committed edit that introduces a type error will not be caught by Specula —
your editor and `tsc` still will. `intent-warning: type-error` is reserved in
the protocol but not produced.

**Reconcile warns; it does not auto-fix.** When the re-rendered DOM diverges
from the optimistic patch, the daemon sends `intent-warning` — it surfaces the
divergence. It does not roll the edit back or correct it; the source change is
already committed.

## Runtime

**No filesystem watcher.** The daemon builds its source map at boot and
refreshes a file after *its own* commits. It does **not** detect edits you make
by hand while it is running — its map can then go stale, and the protocol's
`file-changed` push is reserved but not emitted. After hand-editing a file,
restart `specula dev`.

**One project per daemon.** `specula dev` runs a single project. There is no
multi-project or multi-root mode.

## Edit surface

**Only static values are editable.** The inspector edits static literals — a
plain text node, a string `className`, a string `src`. A `{variable}` text
node, a `className={cn(...)}` call, or any computed value is reported as not
editable rather than edited wrongly.

**`set-style` is a Tailwind lowering.** `set-style` is lowered to a Tailwind
arbitrary-property class (e.g. `[padding:16px]`). It does not write a
`style={{ ... }}` prop or touch a CSS file.

## Platform

**POSIX paths.** Path handling assumes `/` separators — Specula is developed
and tested on macOS and Linux. Windows is untested.
