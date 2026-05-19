# Specula — v1 Contracts

Specula is a bidirectional bridge between rendered DOM and source AST, mediated by
an AI agent. The browser is the editing surface; the codebase stays the source of
truth; a coding agent translates visual intent into code edits.

These three contracts are **frozen before Day 1 of implementation**. The build
sequence executes against them; it does not renegotiate them mid-flight. Changing a
contract is a deliberate, versioned act — not a side effect of writing code.

## The three contracts

1. **[identity.md](identity.md)** — what a stable reference to a JSX element *is*.
2. **[protocol.md](protocol.md)** — the verb vocabulary, message shapes, and the
   transaction lifecycle every edit runs through.
3. **[verification.md](verification.md)** — what "verified" means, gate by gate,
   tier by tier.

## The invariant these contracts exist to guarantee

> No Specula transaction leaves the user looking at a broken state. Every
> transaction either **(a)** commits a verified edit, **(b)** rolls back to the
> exact pre-transaction state, or **(c)** commits and surfaces an honest async
> warning with one-click revert. There is no fourth outcome.

"No mistakes" is not zero errors — Specula will mis-resolve intent and ship bugs.
It is **zero silent, irreversible errors**. The contracts are designed around the
failure mode, not the success path.

## v1 scope (decided)

| Axis | v1 decision |
| --- | --- |
| Framework | Next.js 16+ App Router, RSC-aware |
| Bundler | Webpack (`next dev --webpack`) — see below |
| Style system | Tailwind, with CVA / tailwind-variants / shadcn awareness |
| Edit surface | **Tier A only** — `edit-text`, `set-style`, `set-class`, `replace-asset` |
| Agent | not wired in v1; the protocol reserves Tier D |

Structural edits (`move`, `duplicate`, `wrap`, `extract-component`, …) and
agent-mediated edits are **v1.1+**. Each joins the product only when its
verification story is airtight. A tool that does four verbs flawlessly beats a
tool that does twelve with a 5% silent-failure rate.

## Why Webpack-first

Turbopack is the Next.js 16 default and the SWC plugin ABI is stable at
`@swc/core >= 1.15.0` / `next >= 16.1.0`. But two open tickets break Specula
specifically:

- **#78156** — Turbopack crashes when SWC plugins are configured with absolute
  paths via `require.resolve()`.
- **#78181** — under Turbopack the SWC plugin's `Filename` metadata returns only
  the basename, not the full path.

Specula's identity model does **not** depend on bundler-provided filenames (see
[identity.md](identity.md)), so #78181 is not a hard technical blocker — but
combined with #78156 and the ecosystem's "use at your own risk under Turbopack"
warnings, Turbopack is **no-go for the v1 timeline**.

The instrumentation crate is written once and runs in both bundlers. v1 ships
Webpack; the default flips to Turbopack when the tickets close — one line in
`next.config.ts`, no code rewrite, no map-format change. A real plugin API for
custom transforms is on the Turbopack roadmap for Q2 2026; plan against that
horizon, do not depend on it.
