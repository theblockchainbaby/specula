# Specula alpha — run as an experiment

Specula is a visual source editor for Next.js. Click a live page. Edit the real
source. Keep the diff tiny.

The alpha is not a soft launch. It is an experiment with one goal and five
metrics. Nothing else is tracked, pitched, or promised.

## Goal

Prove that strangers can **install** Specula, **edit real code** with it, and
**trust the diff**.

## Hypothesis

A developer who has never seen Specula can — unaided — install it, make a
source edit on a real Next.js project, and look at the resulting `git diff` and
commit it without hesitation.

If that holds, the product's one claim holds. If it doesn't, no feature fixes
it.

## What we measure — only this

Five metrics. Each has a definition, a capture method, and a pre-registered
line drawn *before* looking at any data.

### 1 · Install success rate

- **Definition:** of testers who start, the fraction who reach a live overlay
  (`specula dev` running, overlay loaded, an element selected) with no help.
- **Capture:** debrief Q1.
- **Line:** ≥ 75% is a sound install path. Below 50% — install is the single
  thing to fix before anyone else is invited.

### 2 · Time to first committed edit

- **Definition:** wall-clock from `specula dev` starting to the tester's first
  edit appearing in `git diff`.
- **Capture:** tester self-reports — note the start; the first edit's `git diff`
  (or file timestamp) marks the end.
- **Line:** median under 5 minutes. The loop should feel like a tool, not a
  setup. A median past ~10 minutes means it isn't discoverable.

### 3 · First failure point

- **Definition:** the first step that broke, blocked, or confused each tester.
  One bucket per tester: `install/build` · `project wiring` · `daemon
  connection` · `select` · `edit applies` · `edit commits to source` · `the
  diff` · `none`.
- **Capture:** debrief Q3.
- **Line:** none — this metric is diagnostic. The histogram across testers
  *is* the v1.1 fix list, ranked by how many people each point stopped.

### 4 · Trust in the Git diff

- **Definition:** shown the `git diff` of an edit they made, would the tester
  commit it as-is — `yes` / `qualified` / `no`.
- **Capture:** debrief Q4.
- **Line:** ≥ 90% `yes` among testers who reached a diff. **This is the gate.**
  Trust is the one thing v1 is built to have nailed; anything below the line is
  a STOP — fix the diff before recruiting another tester.

### 5 · Ask to use it again

- **Definition:** would the tester reach for Specula again on their next
  Next.js page — `yes` / `maybe` / `no`.
- **Capture:** debrief Q5.
- **Line:** ≥ 50% clear `yes` reads as real pull. Not a hard gate — the demand
  signal that says whether to widen.

## The session

Each tester runs one hands-on session, on their own project (or the bundled
demo if they have no fitting project handy):

1. `git clone` → `npm run setup` → `specula dev`. **Note the start time.**
2. Make three edits: a text edit, a class or style edit, a structural edit.
3. After the first edit, open `git diff` and read it.
4. Answer the five debrief questions.

No walkthrough, no pairing. If they get stuck, that *is* the result — record
where, and let metric 3 do its job.

## The debrief — the measurement instrument

Five questions, one per metric. Ask them verbatim.

1. **Install** — "Did you get `specula dev` running with the overlay live, on
   your own? If not — where did it stop?"
2. **Time** — "From `specula dev` starting to your first edit showing in
   `git diff` — roughly how long?"
3. **First failure** — "What was the *first* thing that broke, blocked, or
   confused you? (or 'nothing')"
4. **Trust** — "Open `git diff` for an edit you made. Would you commit it
   as-is? What, if anything, made you hesitate?"
5. **Use again** — "Would you reach for Specula again on your next Next.js
   page — yes / maybe / no? One line on why."

## Results tracker

One row per tester. Copy to a sheet; fill it from the debrief.

| Tester | Install (✓/✗) | Time to 1st edit | First failure point | Trusts diff (Y/Q/N) | Use again (Y/M/N) |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Aggregates to compute:

- **Install success rate** = ✓ ÷ total.
- **Time to first edit** = median of the column.
- **First failure point** = a count per bucket (the histogram).
- **Trust** = `Y` ÷ (testers who reached a diff).
- **Use again** = `Y` ÷ total.

## Reading the result

- **Trust ≥ 90% and install ≥ 75%** — the core claim holds. If `use again` also
  shows real pull, widen carefully to a second wave.
- **Trust below the line** — STOP. Trust is the product. Fix the diff and the
  transaction before another tester is invited; nothing else matters until it
  is back over the line.
- **Install is the dominant failure point** — the install path is v1.1
  priority #1.
- **Trust holds but `use again` is weak** — Specula works and is trusted but
  doesn't pull. The gap is who it's for and why they'd reach for it — a
  sharper target, not more capability.
- **The first-failure histogram** — the ranked v1.1 backlog, whatever it
  contains.

## Running it

- **Cohort:** ~15–20 completed sessions — enough for a clear read on binary and
  bucketed metrics. Invite in one or two waves.
- **Cadence:** sessions are self-paced; collect each debrief within a day of
  the session while it is fresh.
- **Done when:** the five metrics have a clear read — the alpha has either
  shown the core claim holds, or produced the ranked list of what to fix first.

## Guardrails

- Keep every alpha conversation on the three things in the goal — install, edit,
  trust. Nothing about what comes next.
- Do not lead the tester or rescue them mid-session. A failure is data; the
  point of metric 3 is to catch it honestly.
- Five metrics. Resist adding a sixth — a tracked metric you do not act on is
  noise, and the decision rule above only needs these.
