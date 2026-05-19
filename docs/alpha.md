# Specula alpha

Specula v1.0.0-alpha is feature-complete and verified. What it has not had is
**strangers' code**. The alpha exists to answer one question: does the
source-edit guarantee hold on a project that isn't ours?

It is deliberately small — a handful of hands-on testers, not a waitlist.

## What a tester gets

- The repo and a setup walkthrough.
- A direct line for bugs — especially any edit that lands wrong in source.
- Influence on what v1.1 fixes first.

## What a tester does

- Points Specula at a real Next.js 16 / App Router / Webpack / Tailwind project.
- Edits text, classes, styles, assets, and structure — and checks the diffs.
- Reports anything that violates the invariant: a silent corruption, a bad
  diff, a transaction that neither commits cleanly nor rolls back cleanly.

That last one is the whole point. Testers who already think "here's how I'd
break it" are exactly who this is for.

## The signup list

Keep it tiny and zero-infrastructure: a [Tally](https://tally.so) form (free,
no-code, ~5 minutes to stand up) linked from the launch post. Collect responses
to a sheet; invite in one or two small cohorts.

### Form intro blurb

> **Try Specula — alpha**
>
> Specula edits your rendered Next.js app and commits the change straight to
> your source, as a minimal diff. v1 is feature-complete and verified; the
> alpha is about one thing — does that guarantee hold on *your* code?
>
> Small cohort, hands-on. If that's you, leave your details.

### Form fields

| # | Field | Type | Required |
| --- | --- | --- | --- |
| 1 | Email | email | yes |
| 2 | Name or handle | short text | no |
| 3 | The project you'd point Specula at — a repo link or one sentence | short text | no |
| 4 | Is it Next.js 16, App Router, on the Webpack dev server, with Tailwind? | yes / partly / no | yes |
| 5 | Can you build from source? (needs a Rust toolchain) | yes / no / will install | yes |
| 6 | In one line — what would make Specula genuinely useful to you? | short text | no |
| 7 | What do you think you'd break first? | long text | no |

Seven fields, two required. Field 4 is the fit filter — v1's surface is Next 16
App Router + Webpack + Tailwind (see [known-limitations.md](known-limitations.md));
a "no" is a v1.1 conversation, not a v1 tester. Field 7 is the best qualifying
signal there is — answer it well and you're in.

## Running it

- **Cohort:** ~20–30 testers total, invited in one or two waves.
- **Cadence:** a short check-in each week of the alpha; bugs anytime.
- **Done when:** the source-edit guarantee has survived a dozen real codebases,
  or the alpha has found the v1.1 priority list. Either is a win.
