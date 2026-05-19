# How Specula works

Specula turns a click in the browser into a minimal-diff edit on a line of
source code. This document walks the loop that makes that safe. The formal,
frozen contracts live in [`specs/`](../specs/); this is the readable companion.

## The loop

```
  click in the browser
        │
        ▼
  overlay hit-tests the DOM ──► data-spc id ──► "select" ──────► daemon
        │                                                          │
        │                                   resolves the id in the source map
        │                                                          │
        ◄──────────────── "select-ok" (env, tier, what's editable) ─┘
        │
  inspector edit ──► "intent" ──────────────────────────────────► daemon
        │                                                          │
        ◄── "intent-ack" ──────────────────────────────────────────┤
   patch the DOM now (Tier A)                  stage → apply → parse gate
        │                                                          │
        ◄── "intent-committed" ────────────────────────────────────┘
            source rewritten as a minimal diff
            (or "intent-failed" → file rolled back, optimistic patch reverted)
```

Three components, one loop:

- The **SWC plugin** instruments every JSX element at build time.
- The **overlay** runs in the browser: hit-testing, the selection ladder, the
  inspector, and emitting *intent*.
- The **daemon** owns the project: it holds the source map, resolves intent
  into an AST edit, verifies it, and writes the file.

The overlay speaks *intent*, never implementation — it never touches a file.
Only the daemon writes source.

## Element identity

The hard problem: a stable name for "this element" that survives editing the
file. Line and column numbers do not survive — insert one line and every id
below it is wrong.

Specula's id is **structural**. For the heading in `app/page.tsx`:

```
app/page.tsx#Home/main:0/h1:0
└──────────┘ └──┘ └────┘ └──┘
 file        owner  ancestors, each <tag>:<sibling-index>
```

It reads: *in `app/page.tsx`, inside the `Home` component, the first `<main>`,
its first `<h1>`*. The file part is **project-relative** — no absolute author
path is ever baked into shipped HTML. Insert a sibling above the `<h1>` and its
index shifts deterministically; insert a line and nothing shifts at all.

The SWC plugin writes this id into a `data-spc` attribute on every element, so
the overlay can read it straight off the clicked DOM node.

## One algorithm, two modes

The id only works if the bundler and the daemon compute it *identically*. They
do, because they run the same code — `specula-core`, the path algorithm:

- **Transform mode** — the SWC plugin: injects `data-spc` / `data-spc-env`.
- **Analyze mode** — the `specula-analyze` CLI the daemon spawns: emits the
  source map (every element's id, file, tag, and what is editable).

Same crate, same traversal. The bundler and the daemon can never disagree on
what an element is called. See [`specs/identity.md`](../specs/identity.md).

## The transaction lifecycle

Every mutating edit is a transaction. The daemon never half-writes a file.

1. **intent** — the overlay sends the verb, the target id, and the new value.
2. **classify** — the daemon resolves the id to a source file and AST node,
   and computes the *tier* and *blast radius*.
3. **intent-ack** — for Tier A, the ack carries an exact `DomMutation`; the
   overlay applies that optimistic patch immediately, so the user sees the
   change with no latency.
4. **stage** — the daemon snapshots the target file in memory.
5. **apply** — `specula-core` plans a byte-range *splice* — the target node's
   span and its replacement text — and `specula-edit` splices it into the
   original source. Only the changed bytes move; the rest of the file is
   preserved exactly.
6. **parse gate** — the rewritten file must still parse as valid TSX. If it
   does not, the transaction rolls back to the staged snapshot.
7. **commit / rollback** — `intent-committed`, or `intent-failed` with the file
   restored byte-for-byte and the optimistic patch reverted.
8. **reconcile** — after the framework re-renders, the overlay reports what it
   actually sees; the daemon compares it to the optimistic patch and sends an
   `intent-warning` if they diverge.

Transactions are **serialized per file** — never two concurrent writes to one
file. [`specs/verification.md`](../specs/verification.md) is the formal gate
contract; it reserves render and typecheck gates that v1 does not yet run (see
[known limitations](known-limitations.md)).

## Tier A vs Tier B

| | Tier A — property edits | Tier B — structural edits |
| --- | --- | --- |
| Verbs | `edit-text`, `set-class`, `set-style`, `replace-asset` | `delete`, `duplicate`, `wrap`, `move` |
| Optimistic patch | yes — DOM updates on `intent-ack` | no |
| Re-render | the patch *is* the preview; reconcile confirms it | Next.js Fast Refresh |

Tier A edits are the frequent ones, so they are made to feel instant. Tier B
edits change the element tree; the daemon commits the source edit and lets Fast
Refresh redraw — fast enough that an optimistic patch is not worth the risk.

## Trust and transport

- The daemon and overlay talk over a **loopback WebSocket**. A localhost socket
  is reachable by any browser tab, so the daemon mints a session token, rejects
  any connection whose `Origin` is not the dev server's, and rejects any first
  message that is not a valid `hello` carrying that token.
- The daemon serves the overlay bundle itself, at `GET /specula.js`, with the
  port and token baked in — which is why one dev-only `<script>` tag in your
  layout is the whole browser-side install.

## Where it is going

The protocol reserves an agent tier (Tier D) and a verb vocabulary beyond v1.
v1 is the direct-manipulation foundation: get the click-to-source loop correct
and trustworthy first. The full protocol is in
[`specs/protocol.md`](../specs/protocol.md).
