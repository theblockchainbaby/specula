# Alpha recruitment — channel copy

Ready-to-post copy for recruiting the first ~10 alpha testers. Fill the
`<repo link>` and `<demo link>` placeholders once those exist (Day 1).

## Who you want

Strangers with a **real Next.js 16 / App Router / Webpack / Tailwind** project
and **no stake** in Specula. Friends and family give polite, agreeable feedback
— useless for an experiment whose entire point is honest signal. The best
tester is someone who will say *"this diff looks wrong"* to your face.

## Posting norms

- **Stagger it.** One or two channels per half-day across Day 2–3. A
  simultaneous blast reads as spam, and you cannot keep up with the replies.
- **Show HN:** post Tue–Thu, ~8–10am US Eastern, and stay online for hours —
  HN reception depends on the poster replying to every comment.
- **Reddit:** read each subreddit's self-promotion rules first. Post r/nextjs
  first (best fit). Don't paste identical text everywhere within the same hour.
- **Discord:** only in the designated showcase / "I made this" channels, as a
  member who participates. Never DM the link unsolicited.
- **Track the source.** Record which channel each tester came from — after the
  alpha that tells you where your people are.

---

## Show HN

**Title:** `Show HN: Specula – a visual source editor for Next.js`

**Body:**

> I built Specula to scratch a specific itch: visual editors for real codebases
> either export code (a one-way door) or keep their own state alongside your
> app (two sources of truth that drift). I wanted neither.
>
> Specula instruments your JSX with a Rust SWC plugin. You run your Next.js
> app, click an element in the browser, and edit its text / Tailwind classes /
> styles — and the change is written back to your `.tsx` file as a minimal
> diff: only the bytes you changed move, formatting and everything else
> untouched. Your codebase stays the source of truth.
>
> What I actually care about is trust. Every edit runs as a transaction —
> stage, apply, parse-gate, then commit or roll back byte-for-byte — so it
> can't silently corrupt a file. The real test of the idea: you look at the
> `git diff` afterward and would merge it as-is.
>
> It's v1.0.0-alpha and honestly rough: Webpack + Next.js 16 App Router +
> Tailwind only, builds from source (needs Rust), not on npm yet.
>
> Demo (60s): \<demo link> · Repo: \<repo link>
>
> I'm looking for ~10–15 developers to try it on a real project and tell me
> where it breaks — especially if a diff ever makes you hesitate.

## r/nextjs

**Title:** `I built a visual source editor for Next.js — click a live page, edit the real source. Looking for alpha testers.`

**Body:**

> Specula is a visual source editor for Next.js. Click a live page, edit the
> real source, keep the diff tiny.
>
> You run your Next.js app, click an element, and change its text / Tailwind
> classes / styles in a small overlay. The change is written back to your
> actual `.tsx` file as a minimal diff — only what you changed moves. It's not
> an exporter and not a separate visual state; your code stays the source of
> truth.
>
> Every edit is a transaction (apply → parse-gate → commit or byte-for-byte
> rollback), so it won't silently mangle a file. The honest test is whether
> you'd merge the resulting `git diff` without thinking twice.
>
> v1.0.0-alpha, and rough: Webpack + Next 16 App Router + Tailwind only, builds
> from source (needs Rust), not on npm yet.
>
> Demo (60s): \<demo link> · Repo: \<repo link>
>
> I want ~10 people to run it on a real project and tell me where it breaks.
> If you've got a Next.js 16 App Router project and ~30 minutes, comment or DM.

## r/reactjs

Lower priority. Specula v1 is **Next.js App Router specific**, and r/reactjs is
broadly React (Vite, CRA, Remix…) — most readers won't be able to run it. Only
post here if you lead the title and first line with **"Next.js App Router
only"** so you don't waste people's time. r/nextjs is the better room.

## Discord (Next.js / Reactiflux)

Post in the designated **#showcase** / **#i-made-this** channel — not `#general`,
not DMs. Be a member who participates; a drive-by link gets ignored or removed.

> Built a thing for Next.js devs: **Specula** — click an element in your
> running app, edit its text / classes / styles, and the change writes back to
> your source `.tsx` as a tiny `git diff`. Codebase stays the source of truth;
> every edit is a transaction, so it can't corrupt a file. v1.0.0-alpha —
> looking for a few people to break it on a real project. 60s demo:
> \<demo link> · repo: \<repo link>. Happy to answer anything here.

## X / Twitter (thread)

> **1/** Specula is a visual source editor for Next.js. Click a live page. Edit
> the real source. Keep the diff tiny. \<demo video>
>
> **2/** Visual editors for real codebases usually export code (a one-way door)
> or keep their own state (two sources of truth that drift). Specula does
> neither — you edit the rendered page, it writes a minimal diff back to your
> actual `.tsx`.
>
> **3/** The part I care about: every edit is a transaction — stage, apply,
> parse-gate, commit or roll back byte-for-byte. It can't silently corrupt a
> file. The test of the whole idea is whether you'd merge the `git diff` as-is.
>
> **4/** v1.0.0-alpha. Honest about it: Webpack + Next 16 App Router +
> Tailwind, builds from source, not on npm yet.
>
> **5/** I'm looking for ~10–15 devs to try it on a real Next.js project and
> tell me where it breaks. Repo + the 30-min alpha: \<repo link>. Reply or DM.

## Indie Hackers

For developers shipping a SaaS on Next.js.

**Title:** `I built a visual source editor for Next.js — looking for alpha testers`

**Body:**

> If you ship a SaaS on Next.js, you know the friction of small page edits —
> copy tweaks, spacing, swapping a class. Specula lets you click the live page
> and make those edits visually, and writes them back to your real source as a
> tiny `git diff`. No export, no separate CMS-ish state — your repo stays the
> truth, and every change is an ordinary reviewable commit.
>
> v1.0.0-alpha: Next 16 App Router + Webpack + Tailwind, builds from source.
> I want ~10 people to try it on a real project. Demo: \<demo link> · Repo:
> \<repo link>.
