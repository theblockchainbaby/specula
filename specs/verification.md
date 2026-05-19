# Contract 3 — Verification Gate

*What "verified" means, gate by gate, tier by tier.*

## The invariant

> No Specula transaction leaves the user looking at a broken state. Every
> transaction either **(a)** commits a verified edit, **(b)** rolls back to the
> exact pre-transaction state, or **(c)** commits and surfaces an honest async
> warning with one-click revert. There is no fourth outcome.

This contract is the definition of (a), (b), and (c).

## Latency tiers

| Tier | Name | Latency | Applies to |
| --- | --- | --- | --- |
| A | Optimistic instant | <100ms perceived | text / class / style / src edits — the overlay patches the DOM, the daemon reconciles behind it |
| B | Client Fast Refresh | 200–500ms | structural edits inside client components *(v1.1+)* |
| C | Server segment reload | 0.5–2s, honest | structural edits inside server components — RSC re-renders the route segment; optimistic patching is not viable *(v1.1+)* |
| D | Agent-mediated | 2–10s, streamed | model-routed edits *(v2)* |

**v1 implements Tier A only.** B/C/D are specified here so the protocol and the
gates are forward-compatible. The overlay shows the user which tier the current
edit will run in *before* they commit — read from `data-spc-env` plus the verb —
converting "the tool is sometimes slow" into "the tool is honest about when
physics intervene."

## Gates

Six gates, in order. Each is one of:

- **block** — failure rolls the transaction back to the exact pre-edit state.
- **block→warn** — failure keeps the committed file and surfaces a warning with
  one-click revert (the file edit may be correct even when the gate trips).
- **async-warn** — runs *after* commit; failure surfaces a warning with one-click
  revert; never blocks latency, never auto-reverts.

### 1. Staleness — pre-apply, block

Before writing, the daemon re-reads and re-hashes the target file. If it changed
since the map was built, the daemon re-parses and re-resolves the path. If the
targeted node no longer exists or is ambiguous, the transaction fails with
`stale`. This closes the human-edits-in-VS-Code-while-the-daemon-writes race
without locks.

### 2. Parse — post-write, block, inline

The written file is re-parsed and must be valid TS/JSX. For Tier A this should
essentially never fail — an AST mutation plus the formatter produces valid code
by construction — so the gate is the safety net for bugs in the mutator itself.

### 3. Render — post-write, block

After the write, the dev server processes the change. The gate **passes** when
all of:

- no bundler/compile error,
- no runtime error, 500, or React error-boundary trip on the affected route
  (the overlay reports whether the dev error overlay appeared),
- the HMR / Fast Refresh / RSC reconcile is observed to complete.

Any failure rolls back.

### 4. Reconcile — Tier A only, block→warn

The optimistic DOM patch is compared against the authoritative post-reconcile DOM
**semantically** — see rules below. A divergence does **not** prove the file edit
is wrong: the daemon may have written a correct class that the overlay's
optimistic guess didn't predict. Rolling back a correct edit because the
*preview* was wrong would itself be a mistake. So reconcile failure keeps the
file and emits `intent-warning: reconcile-divergence`; the user decides.

### 5. Typecheck — async-warn (A/B/C), block (D)

`tsc --noEmit`, scoped to the changed file's program. Too slow to block Tier A
latency, so for Tier A/B/C it runs **after commit**; failure emits
`intent-warning: type-error` with one-click revert. The file stays committed —
a type error may be pre-existing or acceptable mid-flow — but the user is told.
For Tier D (multi-file agent edits) typecheck is a **blocking** pre-display gate.

### 6. Screenshot-vision — Tier D only, block, ≤2 retries

Screenshot the affected region, compare against the stated intent with a vision
model, retry the edit up to twice, then surface to the user. Distinct from the
reconcile gate (#4) — different cost, different problem shape. **Out of v1 scope.**

## The verification matrix

| Gate | Tier A | Tier B | Tier C | Tier D |
| --- | --- | --- | --- | --- |
| 1 · Staleness | block | block | block | block |
| 2 · Parse | block | block | block | block |
| 3 · Render | block | block | block | block |
| 4 · Reconcile (semantic) | block→warn | — | — | — |
| 5 · Typecheck | async-warn | async-warn | async-warn | block |
| 6 · Screenshot-vision | — | — | — | block, ≤2 retries |

## Semantic reconcile rules

The reconcile comparison asks **"was the intent satisfied"**, not "is the DOM
byte-identical". Literal comparison produces false divergences.

- **`edit-text`** — the target text node's content equals the intended text.
- **`set-class` / `set-style`** — compare the **computed style** of the property
  the user intended to change (`getComputedStyle`), not the class string. The
  daemon may legitimately write a different-but-equivalent class (e.g. a theme
  token instead of an arbitrary value); what the user sees is the computed value.
- **`replace-asset`** — compare the element's *resolved* image to the intended
  asset. For `next/image` the rendered `src` is `/_next/image?url=<encoded>&…`;
  the comparator **decodes the `url` query parameter** and compares that to the
  intended asset path. Naive `src`-string equality would flag every single image
  swap as a divergence.

## Rollback mechanics

Staging is an **in-memory snapshot** of the target file's pre-edit content, held
under the `txId` until the transaction commits or rolls back. This works on
non-git projects and adds no dependency on the repo state.

- **commit** — drop the snapshot.
- **rollback** — write the snapshot back, let HMR/RSC recover, instruct the
  overlay to revert its optimistic patch.

Per-edit git commits are deliberately *not* part of the lifecycle — they would be
noise. Grouping a session's committed edits into a narrated PR is a separate,
user-triggered feature (v1.1+).

## Why this is "no mistakes"

"No mistakes" reduces to the matrix above plus the invariant: every transaction
terminates in exactly one of commit / rollback / commit-with-honest-warning. The
slow checks (typecheck) run async and can flag retroactively — the user never
*sees* a broken page; at worst they see, a beat later, "this edit introduced a
type error — revert?" That is the honest, achievable form of perfection.
