# Alpha runbook — the 7 days

The operational plan for running the alpha. The goal is not engineering — it is
getting 10–20 real developers to install Specula, edit real code, and tell you
whether they trust the diff.

Companion docs: the experiment design and metrics are in
[alpha-experiment.md](alpha-experiment.md); the recruitment copy is in
[alpha-recruitment.md](alpha-recruitment.md); the signup form is in
[alpha.md](alpha.md).

## Day 1 — ship the launch surface

- [ ] **Create the Tally form** — fields and intro blurb are in
      [alpha.md](alpha.md). Point responses at a sheet.
- [ ] **Push the repo to GitHub** (public). It is git-ready —
      `git push -u origin master && git push --tags` carries the
      `v1.0.0-alpha` tag.
- [ ] **Fill the `<repo>` placeholder** with the real URL in two files:
      `docs/launch-post.md` and `README.md` (the quick-start block).
- [ ] **Upload the demo.** `docs/demo.webm` is 66s. YouTube (unlisted) and
      Loom both accept webm; if a platform needs MP4, `ffmpeg -i docs/demo.webm
      docs/demo.mp4`. Get a shareable link.
- [ ] **Publish the launch post** — `docs/launch-post.md`, on a blog / dev.to,
      and use it as the basis for the channel posts.
- [ ] Drop the repo + demo links into [alpha-recruitment.md](alpha-recruitment.md).

## Day 2–3 — recruit the first 10

Post the channel copy from [alpha-recruitment.md](alpha-recruitment.md).
Staggered, not all at once.

- [ ] Show HN  · [ ] r/nextjs  · [ ] Next.js / Reactiflux Discord
- [ ] X/Twitter thread  · [ ] Indie Hackers  · [ ] (r/reactjs — only if framed Next-only)

Rules:
- **Recruit strangers.** No friends or family as primary testers — polite
  feedback is useless here.
- Confirm ~10 testers who each have a real **Next.js 16 / App Router / Webpack /
  Tailwind** project (form field 4 is the filter).
- Record which channel each tester came from.

## Day 4–5 — run the sessions

A moderated **30-minute session** per tester. They do NOT pre-install — the
install is part of the test.

Have open: the results-tracker row for this tester
([alpha-experiment.md](alpha-experiment.md)) and a timer.

**The one rule: do not help unless they are completely blocked.** Your
discomfort watching someone struggle is the data. A rescued tester produces a
useless row.

| Time | Step | What you do |
| --- | --- | --- |
| 0:00–0:02 | **Frame it.** "I'll watch you install and use Specula for ~30 min. Think out loud. I won't help unless you're completely stuck — if something's confusing or breaks, that's exactly what I need. Nothing you do is wrong." | — |
| 0:02–0:12 | **Install.** They clone the repo, `npm run setup`, `npm run dev`. | Silent. Note the start time, every hesitation, where they look for help. If they hit a true wall after a real attempt — that's the first failure point; note it, give the minimal unblock, continue. |
| 0:12–0:15 | **Overlay.** They open the printed URL. | Note: do they notice the overlay? Find that clicking selects? |
| 0:15–0:25 | **Edits.** Ask, one at a time: change a piece of text · change an element's classes · duplicate an element. | Silent. After the *first* edit lands, note the time since `specula dev` started. Note where the inspector confuses them. |
| 0:25–0:29 | **The diff.** "Open `git diff` for what you changed. Talk me through what you see." | Watch closely. Hesitation? A "huh"? Then ask: "Would you commit that as-is? Anything make you pause?" |
| 0:29–0:30+ | **Debrief.** The five questions from [alpha-experiment.md](alpha-experiment.md). | Write the answers into the tracker row before the next session. |

## Day 6 — aggregate

- [ ] Fill the results tracker — one row per tester.
- [ ] Compute the five aggregates ([alpha-experiment.md](alpha-experiment.md)).
- [ ] Look for the patterns that matter:
  - the **same install issue** appearing repeatedly,
  - the **same UI confusion** appearing repeatedly,
  - **any hesitation** around the generated diff — even one.

## Day 7 — decide

Apply the gate in [alpha-experiment.md](alpha-experiment.md):

- **🟢 Green** — install ≥ 75%, median first edit < 5 min, trust ≥ 90%,
  reuse ≥ 50%. Recruit the next wave.
- **🟡 Yellow** — they succeed but struggle. Fix onboarding and UX before
  widening; do not add capability.
- **🔴 Red** — they distrust the diff. Pause growth. Repair trust before
  recruiting anyone else.

Trust in the diff is the metric that decides it. If a developer inspects the
change and immediately thinks *"yes, I'd merge this,"* the core idea works and
everything else is improvable later. If they don't, no added functionality will
matter — fix that first, alone.
