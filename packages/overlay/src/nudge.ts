/**
 * Arrow-key nudge — move the selected element by one Tailwind margin step in
 * the arrow's direction. Shift+arrow jumps by 4 steps. Reads the element's
 * current `mt-N` / `-mt-N` / `ml-N` / `-ml-N` class to compute the next value;
 * emits `set-class` with both `add` (the new class) and `remove` (the old one)
 * so each press is a clean one-line diff in source.
 *
 * Only handles integer Tailwind values. Arbitrary classes like `mt-[10px]`
 * and fractional ones like `mt-1.5` are treated as a starting value of zero
 * and would be overwritten — keep that in mind when designing future tests.
 */

import { setClass, type Intent, type Selection } from "./intent.js";

export interface NudgeDeps {
  getSelection: () => Selection | null;
  getSelectedElement: () => Element | null;
  sendIntent: (intent: Intent) => void;
}

type Axis = "mt" | "ml";

interface Direction {
  axis: Axis;
  /** +1 for down/right (positive margin), -1 for up/left. */
  sign: 1 | -1;
}

const ARROW_TO_DIRECTION: Record<string, Direction> = {
  ArrowDown: { axis: "mt", sign: 1 },
  ArrowUp: { axis: "mt", sign: -1 },
  ArrowRight: { axis: "ml", sign: 1 },
  ArrowLeft: { axis: "ml", sign: -1 },
};

/** Read the current integer margin value for `axis` from a className string.
 *  Returns 0 if no matching class is present. Ignores arbitrary values and
 *  fractional steps so they don't poison the increment. */
export function parseMarginValue(className: string, axis: Axis): number {
  const tokens = className.split(/\s+/);
  // Try negative form first so `-mt-2` doesn't match the positive regex.
  const neg = new RegExp(`^-${axis}-(\\d+)$`);
  const pos = new RegExp(`^${axis}-(\\d+)$`);
  for (const t of tokens) {
    const m = t.match(neg);
    if (m) return -Number(m[1]);
  }
  for (const t of tokens) {
    const m = t.match(pos);
    if (m) return Number(m[1]);
  }
  return 0;
}

/** The Tailwind class for `axis` at `value`. `null` when the value is zero
 *  (no class needed — caller should only emit `remove` in that case). */
export function classFromValue(axis: Axis, value: number): string | null {
  if (value === 0) return null;
  if (value > 0) return `${axis}-${value}`;
  return `-${axis}-${-value}`;
}

/** True if the user is currently typing — duplicated from keyboard.ts so the
 *  two modules can be installed independently. */
function isTyping(document: Document): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const ce = active.getAttribute("contenteditable");
  if (ce === "true" || ce === "" || ce === "plaintext-only") return true;
  if (active.isContentEditable) return true;
  return false;
}

export function installArrowKeyNudge(
  document: Document,
  deps: NudgeDeps,
): void {
  document.addEventListener("keydown", (event) => {
    if (isTyping(document)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const direction = ARROW_TO_DIRECTION[event.key];
    if (!direction) return;

    const selection = deps.getSelection();
    const element = deps.getSelectedElement();
    if (!selection || !element) return;

    const step = event.shiftKey ? 4 : 1;
    const current = parseMarginValue(element.className, direction.axis);
    const next = current + direction.sign * step;

    const oldClass = classFromValue(direction.axis, current);
    const newClass = classFromValue(direction.axis, next);

    const add = newClass ? [newClass] : [];
    const remove = oldClass ? [oldClass] : [];
    if (add.length === 0 && remove.length === 0) return;

    deps.sendIntent(setClass(selection, "base", add, remove));
    event.preventDefault();
  });
}
