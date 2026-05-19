# Demo shot list — Specula v1.0.0-alpha

A 60–90s demo. One job: show that a click in the browser becomes a real,
minimal, reviewable diff in source — and that it is trustworthy.

`docs/demo.webm` is a silent reference capture of this sequence against the
bundled playground — use it for pacing, then record your own with narration.

## Setup before recording

- **Split screen:** browser (left, ~65%) and editor (right, ~35%) showing the
  file being edited. The whole point is the two moving together.
- **Use a page with real content.** The bundled playground is intentionally
  minimal. For a launch demo, point Specula at a page with a heading,
  Tailwind-classed elements, and an image so the demo shows the full surface.
- Dark editor theme, ~16px terminal/editor font, a clean browser window.
- Move the cursor deliberately. Pause after each commit so the green
  confirmation reads.

## Shot list

| Time | On screen | Voiceover / caption |
| --- | --- | --- |
| 0:00–0:06 | The running app, the source file beside it | "A real Next.js app — and its actual source." |
| 0:06–0:12 | Hover across elements; the faint hover frame tracks the cursor | "Specula is a small overlay. Hover to preview what's editable." |
| 0:12–0:18 | Click the headline — selection frame + inspector panel open | "Click to select. The inspector shows the structural path, the environment, and what you can edit." |
| 0:18–0:30 | Type a new headline in the Text field → Enter → it changes instantly; footer turns green: `edit-text · committed` | "Edit the text. It updates instantly — and commits." |
| 0:30–0:40 | Cut to the source file: exactly one line changed, everything else identical | "Here's the file. One line moved. Formatting, comments, the rest — untouched. A minimal diff." |
| 0:40–0:52 | Back in the browser: add a Tailwind class (or set a style) → it applies → commits | "Classes and styles, the same way — change it in the browser, land it in source." |
| 0:52–1:04 | A structural edit — Duplicate or Wrap — Fast Refresh re-renders the result | "Structural edits too — duplicate, wrap, move elements." |
| 1:04–1:14 | `git diff` in the terminal — every edit as a normal, reviewable diff | "Every edit is an ordinary diff. Reviewable, revertible, yours." |
| 1:14–1:22 | End card: the Specula mark + the invariant line | "Specula. Edit the page, commit the source. v1.0.0-alpha." |

Total: ~82s. Trim shots 0:40–0:52 or 0:52–1:04 to land at 60s.

## What each beat has to land

1. **It's your real app and your real file** — not an export, not a sandbox.
2. **The edit is instant** — the optimistic patch; no waiting.
3. **The diff is minimal** — this is the trust beat. Linger on the source.
4. **It commits like normal work** — `git diff` proves there's no magic state.

## Do not show

- Error/rollback states — true, but not the launch story; save for docs.
- The daemon internals or the protocol — that's `docs/how-it-works.md`.
- Anything aspirational (an AI agent, other frameworks). Demo only what v1
  actually does today.
