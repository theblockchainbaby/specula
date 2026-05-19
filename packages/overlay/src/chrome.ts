/**
 * The overlay's ambient HUD — the boxes drawn over the page and the status
 * chip. Three pieces, one visual family:
 *
 *  - the **selection box** — the solid frame around the selected element,
 *    carrying a tag label and reflecting the live transaction state;
 *  - the **hover box** — a faint frame previewing what a click would select;
 *  - the **status chip** — a small persistent presence reporting the daemon
 *    connection (the overlay's idle / empty state).
 *
 * Browser-only: positioning depends on layout (`getBoundingClientRect`) and a
 * live document, so this is exercised by `browser-verify*.mjs`, not jsdom. The
 * hit-testing that drives it (`resolve.ts`) is fully unit-tested.
 */

import type { ConnectionState } from "./client.js";
import type { TxState } from "./inspector.js";

const SELECTION_ID = "specula-selection-box";
const HOVER_ID = "specula-hover-box";
const CHIP_ID = "specula-status-chip";

/** Draw (or move) the selection box over `element`. */
export function drawSelection(element: Element): void {
  const box = ensureBox(element.ownerDocument, SELECTION_ID);
  positionBox(box, element);
  setLabel(box, element.tagName.toLowerCase(), false);
  box.style.display = "block";
}

/** Hide the selection box and reset its transaction state. */
export function clearSelection(doc: Document = document): void {
  const box = doc.getElementById(SELECTION_ID);
  if (box) {
    box.style.display = "none";
    box.dataset.state = "idle";
  }
}

/** Reflect a transaction's lifecycle state on the selection box. */
export function setSelectionState(
  state: TxState,
  doc: Document = document,
): void {
  const box = doc.getElementById(SELECTION_ID);
  if (box) box.dataset.state = state;
}

/** Draw (or move) the faint hover box over `element`. */
export function drawHover(element: Element): void {
  const box = ensureBox(element.ownerDocument, HOVER_ID);
  positionBox(box, element);
  setLabel(box, element.tagName.toLowerCase(), true);
  box.style.display = "block";
}

/** Hide the hover box. */
export function clearHover(doc: Document = document): void {
  const box = doc.getElementById(HOVER_ID);
  if (box) box.style.display = "none";
}

/** Report the daemon connection state on the persistent status chip. */
export function setConnectionState(
  state: ConnectionState,
  doc: Document = document,
): void {
  const chip = ensureChip(doc);
  const dot = chip.querySelector<HTMLElement>(".spc-dot");
  if (dot) dot.dataset.state = state;
  const label = chip.querySelector<HTMLElement>(".spc-hud-label");
  if (label) label.textContent = CHIP_LABEL[state];
  chip.style.display = "flex";
}

const CHIP_LABEL: Record<ConnectionState, string> = {
  connecting: "connecting…",
  open: "specula",
  closed: "daemon offline",
};

/** Size and place a box exactly over `element`'s client rect. */
function positionBox(box: HTMLElement, element: Element): void {
  const rect = element.getBoundingClientRect();
  box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  // The label sits above the box; flip it inside when the box hugs the top.
  const label = box.firstElementChild;
  if (label) label.classList.toggle("spc-box__label--below", rect.top < 20);
}

/** Set a box's tag label, marking it as the hover (dim) variant or not. */
function setLabel(box: HTMLElement, tag: string, hover: boolean): void {
  const label = box.firstElementChild;
  if (!label) return;
  label.textContent = tag;
  label.classList.toggle("spc-box__label--hover", hover);
}

/** The selection or hover box, created with its label child on first use. */
function ensureBox(doc: Document, id: string): HTMLElement {
  const existing = doc.getElementById(id);
  if (existing) return existing;
  const box = doc.createElement("div");
  box.id = id;
  const label = doc.createElement("div");
  label.className = "spc-box__label";
  box.appendChild(label);
  doc.body.appendChild(box);
  return box;
}

/** The status chip, created with its dot + label on first use. */
function ensureChip(doc: Document): HTMLElement {
  const existing = doc.getElementById(CHIP_ID);
  if (existing) return existing;
  const chip = doc.createElement("div");
  chip.id = CHIP_ID;
  const dot = doc.createElement("span");
  dot.className = "spc-dot";
  const label = doc.createElement("span");
  label.className = "spc-hud-label";
  chip.append(dot, label);
  doc.body.appendChild(chip);
  return chip;
}
