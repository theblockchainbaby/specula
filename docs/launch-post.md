# Specula

**Specula is a visual source editor for Next.js. Click a live page. Edit the
real source. Keep the diff tiny.**

*v1.0.0-alpha — an honest alpha. It needs strangers to try to break it.*

Visual editors for real codebases tend to fail one of two ways. Either they
**export** code — a one-way door; touch the export by hand and the tool can't
help you again. Or they keep their **own state** — a model layered over your
app, and now you have two sources of truth that drift.

Specula is neither. It treats the rendered DOM and your source as two views of
one thing, and keeps your codebase as the single source of truth.

You run your Next.js app. You click an element in the browser. You change its
text, its Tailwind classes, a style, or swap an image — and Specula writes that
change back to your actual `.tsx` file as a **minimal diff**: only the bytes you
changed move. Formatting, comments, every other line — untouched. Then you
commit it like any other edit, because it *is* one.

## What it's built around: trust

A tool that edits your source has one job it cannot fail — it must never
quietly corrupt a file. So Specula's design starts from the failure mode, not
the happy path.

Every edit is a transaction. The daemon snapshots the file, applies the edit,
runs a parse gate, and then either commits it or rolls the file back
**byte-for-byte**. The invariant, stated plainly:

> No Specula transaction leaves you looking at a broken state. It commits a
> verified edit, rolls back exactly, or commits with an honest warning and
> one-click revert. There is no fourth outcome.

"No mistakes" doesn't mean zero errors — Specula will mis-resolve intent
sometimes. It means **zero silent, irreversible ones**. Every change is visible,
diffable, and reversible, because it lands in source control like everything
else you write.

## How it works, briefly

A Rust SWC plugin instruments your JSX at build time, tagging every element with
a **structural identity** — `app/page.tsx#Home/main:0/h1:0`, not a line number.
Line numbers don't survive an edit; structure does. A local daemon holds the
map. When you click, the overlay hit-tests to that identity; when you edit, it
sends an *intent*; the daemon resolves the intent to an AST splice, runs the
transaction, and writes the file. Property edits patch the DOM optimistically,
so the change is visible instantly while the real edit reconciles behind it.

The overlay is a small dark HUD — closer to Chrome DevTools than to a design
tool. Hover to preview, click to select, edit in the inspector. It shows the
structural path, the server/client environment, and the live state of every
transaction.

## What v1 is — and isn't

v1 does eight edits, end to end and verified: **edit text, set classes, set a
style, replace an asset**, and **delete, duplicate, wrap, move**. That is the
whole surface, deliberately — a tool that does eight things without silent
failure beats one that does forty with a 5% corruption rate.

It is also honest about its edges. v1 targets **Webpack + Next.js 16 App Router
+ Tailwind**. It builds from source (you need Rust) and is not on npm yet. The
full list is in [known-limitations.md](known-limitations.md) — read it; it is
the honest version.

## Try it

```sh
git clone <repo> && cd specula
npm run setup     # installs deps, builds the Rust + overlay artifacts
npm run dev       # starts the bundled demo with Specula live
```

Open the printed URL, click the heading, edit it — then look at
`apps/playground/app/page.tsx`. Your edit is already there, as a one-line diff.

## The ask

v1 is feature-complete and verified — but verified-by-me is not trusted-by-you.
What this needs now is strangers: your real Next.js project, your real
components, your weird JSX, trying to break the source-edit guarantee.

If you will do that — [join the alpha](alpha.md). It is small on purpose.

---

*Built in the open. How the loop works: [how-it-works.md](how-it-works.md).*
