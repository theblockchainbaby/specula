# Contract 1 — Identity

*What a stable reference to a JSX element is.*

## Problem

The element reference is the spine of the whole system: the overlay selects an
element, the daemon must find it in source, edit it, and the overlay must
re-attach after the edit. A line/column hash cannot do this — any inserted or
removed line shifts every element below it, and under Turbopack the SWC plugin
receives only the file's basename (#78181), so a `filepath+line+col` hash
*collides across files*. The reference must survive edits elsewhere in the file,
the formatter, and re-renders.

## Decision: the structural AST path

A reference to a JSX element is a **path** — the structural address of the
element within its source file.

### Grammar

```
path          := file "#" segment ("/" segment)*
file          := POSIX-relative path from project root      e.g. app/page.tsx
segment       := name discriminator
name          := ComponentName | host-tag-lowercased
discriminator := ":" index  |  "@" keyLiteral
index         := 0-based integer, counted among same-name siblings
keyLiteral    := the element's static string `key` prop, URL-encoded
```

Example: `app/page.tsx#HomePage/main:0/section:1/h1:0`

- `HomePage` — the root segment is the nearest enclosing named component that
  owns the JSX. The `#` prefix already scopes the file.
- `section:1` — the **second** `<section>` among its parent's `<section>`
  children. Same-name indexing means adding a `<div>` between two `<section>`s
  does not renumber the sections.
- `ul:0/Card@pricing` — an element with a static string `key` uses `@key` in
  place of `:index`; author-provided keys are more stable than positional index.

Paths are kept human-readable on purpose. They are dev-only and never reach a
production bundle, so there is no size pressure to hash them — and readability
makes the daemon, the DOM inspector, and bug reports legible.

### What carries the path at runtime

The instrumentation stamps two attributes on every JSX element:

- `data-spc="<path>"` — the structural path.
- `data-spc-env="server" | "client"` — derived from `"use client"` detection;
  selects the latency tier (see [verification.md](verification.md)).

Both attributes are dev-only and stripped from production builds.

## Path computation rules

1. **Root segment** — the nearest enclosing named declaration that owns the JSX
   (a function component, `const X = () => …`, a class `render`). Anonymous
   owners fall back to `$<n>` indexed by source order and are flagged
   low-confidence.
2. **Host elements** — segment name is the lowercased tag (`div`, `h1`). They
   always produce a DOM node and always carry `data-spc`.
3. **Component elements** — segment name is the component identifier as written
   (`Card`, `Hero`). The attribute is stamped on the JSX but reaches the DOM
   **only if the component spreads props onto a host node**. The daemon's map
   records component elements regardless of whether the attribute survives.
4. **Index** — 0-based, counted among siblings *of the same name only*.
5. **Keys** — a *static string literal* `key` becomes `@<key>`; dynamic keys
   (`key={x.id}`) are ignored and the element uses `:index`.
6. **Fragments** (`<>…</>`, `<Fragment>`) — transparent: no DOM node, no segment.
   Their children attach to the fragment's parent segment.
7. **`.map()` / expression-returned JSX** — the element returned from a callback
   occupies the single structural slot of its `{…}` container and receives
   **one** path. See below.
8. **Conditionals** (`{cond && <X/>}`, ternaries) — each branch has a fixed
   structural slot, so its path is stable whether or not it renders.

## Two structures, one authoritative

- **Daemon source map** — the authoritative model. Built by the daemon from a
  parse of every source file. Records every JSX element (host *and* component):
  its path, AST node range, `env`, parent/children paths, `className` expression
  shape, and whether its children are dynamic.
- **DOM `data-spc` attributes** — a *partial projection* of the map onto rendered
  host elements. Reliable for host elements; present on components only when the
  component forwards props.

The overlay hit-tests clicks through the DOM (`elementFromPoint` → nearest
`[data-spc]`). It resolves everything else — ancestry, the selection ladder,
component identity, edit targets — through the daemon's source map.
**The DOM is for hit-testing; the map is for truth.**

## One algorithm, two modes

To eliminate drift, the path algorithm is implemented **once** — a Rust crate,
`specula-instrument`, with two modes:

- `transform` — injects `data-spc` / `data-spc-env`. Consumed by the bundler as
  an SWC plugin.
- `analyze` — emits the source map. Consumed by the daemon (loaded as WASM/napi).

The plugin and the daemon never compute paths from separate code. A conformance
fixture set guards the crate so the two modes cannot diverge.

## `.map()` and dynamic children

`{items.map(i => <Card key={i.id} />)}` is one `<Card>` in source and N `<Card>`s
in the DOM, all carrying the same `data-spc`. Therefore:

- **`data-spc` is unique in the *source*, not in the *DOM*.** Never assume
  `querySelectorAll('[data-spc="X"]')` returns exactly one node.
- A v1 edit targets the **source** element and so changes **all N** instances.
  The daemon reports `blastRadius.domInstances = N`; the overlay shows
  "this affects 8 cards" before the edit commits.
- Editing one instance differently is a *data* edit, not a markup edit — out of
  v1 scope, reserved for the `bind-data` verb.

## Selection vs. identity

A **path** is a source identity. A **selection** (defined in
[protocol.md](protocol.md)) is `{ path, instanceIndex }`. `instanceIndex`
discriminates among the N DOM nodes of a `.map()`ed path and is used **only** to
position selection chrome. In v1 every edit targets the source, so
`instanceIndex` never changes what gets written.

## Stability

| Event | Path | Notes |
| --- | --- | --- |
| Formatter run (Prettier/Biome) | **stable** | no structural change |
| Non-structural edit elsewhere in file | **stable** | indexing is structural, not positional |
| Specula Tier A edit (text / class / style / src) | **stable** | Tier A edits never change tree structure — therefore never invalidate a path |
| HMR / Fast Refresh / RSC re-render | **stable** | source unchanged; DOM nodes are recreated but carry the same `data-spc` |
| `.map()` rendering | one path → N DOM nodes | by design |
| Human structural edit in the editor | **may change** | daemon recomputes the map on the file-watch event and re-keys |

The load-bearing consequence: **in v1, no Specula-originated edit ever
invalidates a path.** Re-keying is required only after *human* structural edits.

## Re-keying

After a human structural edit, the daemon re-parses the changed file, rebuilds
that file's slice of the map, and diffs it against the previous slice. For each
previously-known path it emits a `rekey` entry:

- `{ from, to }` — the element was re-correlated to a new path (matched by
  subtree shape + content similarity).
- `{ from, to: null }` — the element could not be correlated. The overlay drops
  any selection on it and shows "selection lost — click to re-select". This is an
  acceptable, honest v1 failure.

Specula's *own* edits never need heuristic correlation: the daemon knows exactly
what it changed and computes the rekey delta deterministically. In v1 that delta
is almost always empty, because Tier A edits do not move nodes.
