/**
 * The Specula overlay's visual system — one injected stylesheet.
 *
 * Direction: a dark, precise, developer-grade HUD — closer to Chrome DevTools
 * or the Linear / Vercel command surfaces than to a consumer "AI" widget. The
 * overlay must read as instrumentation you can trust, not a toy.
 *
 * Every rule is namespaced under the overlay's own ids / the `spc-` class
 * prefix, so it cannot leak into the host page and the host's CSS cannot
 * reach in. The inspector and its descendants are reset explicitly.
 */

export const OVERLAY_STYLE_ID = "specula-overlay-styles";

/* The four top-level overlay roots — they carry the design tokens. */
const ROOTS =
  "#specula-inspector,#specula-selection-box,#specula-hover-box,#specula-status-chip";

const CSS = `
${ROOTS} {
  --spc-surface: #131419;
  --spc-raised: #1d1f26;
  --spc-hover: #262932;
  --spc-border: #2c2f3a;
  --spc-border-strong: #3d4250;
  --spc-text: #e8e9ed;
  --spc-text-dim: #9499a6;
  --spc-text-faint: #5f6573;
  --spc-accent: #6e7bff;
  --spc-accent-soft: rgba(110,123,255,0.16);
  --spc-success: #4cc76a;
  --spc-danger: #f05a6e;
  --spc-warning: #e2a833;
  --spc-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
  --spc-sans: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  --spc-shadow: 0 8px 28px -8px rgba(0,0,0,0.65), 0 2px 8px -2px rgba(0,0,0,0.5);
}

/* ---- selection + hover chrome ------------------------------------------- */

#specula-selection-box,
#specula-hover-box {
  position: fixed;
  top: 0;
  left: 0;
  box-sizing: border-box;
  pointer-events: none;
  display: none;
  transition: outline-color 0.14s ease, box-shadow 0.14s ease;
}
#specula-selection-box {
  z-index: 2147483641;
  outline: 1.5px solid var(--spc-accent);
  outline-offset: -1px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.35), 0 0 14px -3px var(--spc-accent-soft);
}
#specula-selection-box[data-state="loading"] { outline-color: var(--spc-accent); }
#specula-selection-box[data-state="success"] { outline-color: var(--spc-success); }
#specula-selection-box[data-state="error"]   { outline-color: var(--spc-danger); }
#specula-selection-box[data-state="warning"] { outline-color: var(--spc-warning); }
#specula-hover-box {
  z-index: 2147483640;
  outline: 1px dashed rgba(110,123,255,0.55);
  outline-offset: -1px;
  background: rgba(110,123,255,0.05);
}

.spc-box__label {
  position: absolute;
  left: -1px;
  top: 0;
  transform: translateY(-100%);
  font: 600 10.5px/1.4 var(--spc-mono);
  letter-spacing: 0.01em;
  padding: 1.5px 5px;
  white-space: nowrap;
  border-radius: 3px 3px 0 0;
  color: #fff;
  background: var(--spc-accent);
}
.spc-box__label--below { transform: none; border-radius: 0 0 3px 3px; }
.spc-box__label--hover { background: #3a3f52; color: var(--spc-text-dim); }
#specula-selection-box[data-state="success"] .spc-box__label { background: var(--spc-success); }
#specula-selection-box[data-state="error"]   .spc-box__label { background: var(--spc-danger); }
#specula-selection-box[data-state="warning"] .spc-box__label { background: var(--spc-warning); color: #1a1300; }

/* ---- status chip (idle / connection presence) --------------------------- */

#specula-status-chip {
  position: fixed;
  bottom: 14px;
  right: 14px;
  z-index: 2147483646;
  display: none;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  padding: 5px 10px 5px 9px;
  background: var(--spc-surface);
  border: 1px solid var(--spc-border);
  border-radius: 7px;
  box-shadow: var(--spc-shadow);
  font: 500 10.5px/1 var(--spc-sans);
  letter-spacing: 0.03em;
  color: var(--spc-text-dim);
  pointer-events: none;
  user-select: none;
}
#specula-status-chip .spc-hud-label { text-transform: lowercase; }

/* ---- the dot — shared state indicator ----------------------------------- */

.spc-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--spc-text-faint);
}
.spc-dot[data-state="loading"],
.spc-dot[data-state="connecting"] { animation: spc-pulse 1.1s ease-in-out infinite; }
.spc-dot[data-state="loading"] { background: var(--spc-accent); }
.spc-dot[data-state="success"],
.spc-dot[data-state="open"]     { background: var(--spc-success); }
.spc-dot[data-state="error"],
.spc-dot[data-state="closed"]   { background: var(--spc-danger); }
.spc-dot[data-state="warning"],
.spc-dot[data-state="connecting"] { background: var(--spc-warning); }

@keyframes spc-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
}

/* ---- inspector panel ---------------------------------------------------- */

#specula-inspector {
  position: fixed;
  top: 14px;
  right: 14px;
  width: 286px;
  z-index: 2147483647;
  display: none;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--spc-surface);
  border: 1px solid var(--spc-border);
  border-radius: 8px;
  box-shadow: var(--spc-shadow);
  font: 12px/1.45 var(--spc-sans);
  color: var(--spc-text);
  -webkit-font-smoothing: antialiased;
}
#specula-inspector * { box-sizing: border-box; }

/* header */
.spc-header {
  padding: 9px 11px 8px;
  border-bottom: 1px solid var(--spc-border);
}
.spc-header__row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.spc-tag {
  font: 600 12px/1 var(--spc-mono);
  color: var(--spc-text);
}
.spc-tag::before,
.spc-tag::after { color: var(--spc-text-faint); font-weight: 400; }
.spc-tag::before { content: "<"; }
.spc-tag::after  { content: ">"; }
.spc-env {
  margin-left: auto;
  font: 600 9px/1 var(--spc-sans);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--spc-text-dim);
  background: var(--spc-raised);
  border: 1px solid var(--spc-border);
  border-radius: 3px;
  padding: 3px 5px;
}
.spc-path {
  margin-top: 6px;
  font: 10.5px/1.4 var(--spc-mono);
  color: var(--spc-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* sections */
.spc-section {
  padding: 9px 11px;
  border-bottom: 1px solid var(--spc-border);
}
.spc-section__label {
  display: block;
  margin-bottom: 6px;
  font: 600 9px/1 var(--spc-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--spc-text-dim);
}

/* inputs */
.spc-input {
  width: 100%;
  margin: 0;
  padding: 5px 7px;
  background: var(--spc-raised);
  border: 1px solid var(--spc-border);
  border-radius: 5px;
  color: var(--spc-text);
  font: 11.5px/1.4 var(--spc-sans);
  appearance: none;
  outline: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.spc-input--mono { font-family: var(--spc-mono); }
.spc-input::placeholder { color: var(--spc-text-faint); }
.spc-input:focus {
  border-color: var(--spc-accent);
  box-shadow: 0 0 0 2px var(--spc-accent-soft);
}
.spc-input:disabled { opacity: 0.45; cursor: not-allowed; }
.spc-input-row { display: flex; gap: 6px; }
.spc-input-row .spc-prop { flex: 2 1 0; min-width: 0; }
.spc-input-row .spc-val  { flex: 3 1 0; min-width: 0; }

/* class chips */
.spc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 6px;
}
.spc-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  padding: 3px 5px 3px 7px;
  background: var(--spc-raised);
  border: 1px solid var(--spc-border);
  border-radius: 5px;
  color: var(--spc-text);
  font: 11px/1.3 var(--spc-mono);
  cursor: pointer;
  outline: none;
  transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
}
.spc-chip__x { color: var(--spc-text-faint); font-size: 12px; line-height: 1; }
.spc-chip:hover:not(:disabled) {
  border-color: var(--spc-danger);
  background: var(--spc-hover);
}
.spc-chip:hover:not(:disabled) .spc-chip__x { color: var(--spc-danger); }
.spc-chip:disabled { opacity: 0.45; cursor: not-allowed; }

/* buttons */
.spc-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.spc-btn {
  margin: 0;
  padding: 4px 9px;
  background: var(--spc-raised);
  border: 1px solid var(--spc-border);
  border-radius: 5px;
  color: var(--spc-text-dim);
  font: 500 11px/1.3 var(--spc-sans);
  cursor: pointer;
  outline: none;
  transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
}
.spc-btn:hover:not(:disabled) {
  border-color: var(--spc-border-strong);
  background: var(--spc-hover);
  color: var(--spc-text);
}
.spc-btn:focus-visible { box-shadow: 0 0 0 2px var(--spc-accent-soft); }
.spc-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.spc-btn--danger:hover:not(:disabled) {
  border-color: var(--spc-danger);
  color: var(--spc-danger);
}

/* selection ladder */
.spc-ladder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}
.spc-rung {
  margin: 0;
  padding: 2px 5px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--spc-text-dim);
  font: 11px/1.3 var(--spc-mono);
  cursor: pointer;
  outline: none;
  transition: color 0.12s ease, background 0.12s ease;
}
.spc-rung:hover:not(:disabled) { color: var(--spc-text); background: var(--spc-raised); }
.spc-rung:focus-visible { box-shadow: 0 0 0 2px var(--spc-accent-soft); }
.spc-rung[data-specula-current] { color: var(--spc-accent); cursor: default; }
.spc-rung-sep { color: var(--spc-text-faint); font-size: 10px; user-select: none; }

/* empty state */
.spc-empty {
  padding: 11px;
  border-bottom: 1px solid var(--spc-border);
  color: var(--spc-text-dim);
  font-size: 11px;
  line-height: 1.5;
}
.spc-empty b { color: var(--spc-text); font-weight: 600; }

/* status footer */
.spc-footer {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 11px;
  font: 11px/1.4 var(--spc-sans);
  color: var(--spc-text-dim);
}
.spc-footer[data-specula-status="idle"] { display: none; }
.spc-footer[data-specula-status="error"]   { color: var(--spc-danger); }
.spc-footer[data-specula-status="warning"] { color: var(--spc-warning); }
.spc-footer[data-specula-status="success"] { color: var(--spc-success); }
.spc-footer__msg {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spc-footer__verb { color: var(--spc-text); font-family: var(--spc-mono); }

/* hint line + file input */
.spc-hint {
  margin-top: 5px;
  font-size: 10px;
  color: var(--spc-text-faint);
}
.spc-file {
  width: 100%;
  margin-top: 6px;
  font: 10.5px var(--spc-sans);
  color: var(--spc-text-dim);
}
.spc-file::file-selector-button {
  margin-right: 8px;
  padding: 4px 9px;
  background: var(--spc-raised);
  border: 1px solid var(--spc-border);
  border-radius: 5px;
  color: var(--spc-text);
  font: 500 11px var(--spc-sans);
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.spc-file::file-selector-button:hover {
  border-color: var(--spc-border-strong);
  background: var(--spc-hover);
}

/* busy — sections are inert while a transaction is in flight */
#specula-inspector[data-busy="true"] .spc-section {
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
`;

/** Inject the overlay stylesheet into `doc` once. */
export function injectStyles(doc: Document): void {
  if (doc.getElementById(OVERLAY_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}
