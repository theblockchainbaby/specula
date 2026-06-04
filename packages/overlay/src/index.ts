/**
 * The injected overlay entry point. Runs inside the dev page: it injects the
 * visual system, captures clicks, hit-tests them to Specula identities, draws
 * the selection chrome, opens the inspector, and runs the Tier-A optimistic
 * loop — patching the DOM the instant an `intent-ack` arrives.
 *
 * It also surfaces state: a hover preview before selection, the daemon
 * connection on the status chip, and each transaction's lifecycle on the
 * selection box and the inspector footer.
 *
 * Browser-only — `startOverlay` wires live DOM events. Its hit-testing core
 * (`resolve.ts`), optimistic core (`patch.ts` / `optimistic.ts`), and inspector
 * (`inspector.ts`) are tested.
 */

import {
  clearHover,
  clearSelection,
  drawHover,
  drawSelection,
  setConnectionState,
  setSelectionState,
} from "./chrome.js";
import { connect } from "./client.js";
import { Inspector, INSPECTOR_ID } from "./inspector.js";
import type { SelectOk } from "./inspector.js";
import { installDragReorder } from "./drag.js";
import { installKeyboardShortcuts } from "./keyboard.js";
import { MultiSelection } from "./multiselect.js";
import { installArrowKeyNudge } from "./nudge.js";
import { OptimisticTracker, routeServerMessage } from "./optimistic.js";
import { findInstance } from "./patch.js";
import { hitTest } from "./resolve.js";
import type { Resolved } from "./resolve.js";
import { injectStyles } from "./styles.js";

export interface OverlayConfig {
  /** The daemon WebSocket URL, e.g. `ws://127.0.0.1:4123`. */
  daemonUrl: string;
  /** The session token, injected into the page by the dev server. */
  token: string;
}

export interface OverlayController {
  /** Send an intent to the daemon. Its optimistic patch is applied to the DOM
   *  as soon as the daemon's `intent-ack` arrives. */
  sendIntent(intent: object): void;
}

function isSelectOk(message: unknown): message is SelectOk {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "select-ok"
  );
}

/** How long a committed `success` state lingers before fading to idle. */
const SUCCESS_LINGER_MS = 1600;

/** Start the overlay. Call once, after the page has loaded. */
export function startOverlay(config: OverlayConfig): OverlayController {
  injectStyles(document);
  setConnectionState("connecting");

  let selected: Resolved | null = null;
  const tracker = new OptimisticTracker(document);
  // Intent id -> verb, so a transaction's lifecycle messages can name it.
  const verbs = new Map<string, string>();
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Reflect a transaction lifecycle message on the chrome and the inspector. */
  function applyTxState(message: unknown): void {
    const m = message as {
      type?: string;
      txId?: string;
      reason?: string;
      detail?: string;
    };
    if (typeof m.txId !== "string") return;
    const verb = verbs.get(m.txId);
    if (fadeTimer !== undefined) {
      clearTimeout(fadeTimer);
      fadeTimer = undefined;
    }
    switch (m.type) {
      case "intent-ack":
        inspector.setStatus("loading", verb);
        setSelectionState("loading");
        break;
      case "intent-committed":
        verbs.delete(m.txId);
        inspector.setStatus("success", verb);
        setSelectionState("success");
        fadeTimer = setTimeout(() => {
          inspector.setStatus("idle");
          setSelectionState("idle");
        }, SUCCESS_LINGER_MS);
        break;
      case "intent-failed":
        verbs.delete(m.txId);
        inspector.setStatus("error", verb, m.reason ?? m.detail);
        setSelectionState("error");
        break;
      case "intent-warning":
        verbs.delete(m.txId);
        inspector.setStatus("warning", verb, m.reason ?? m.detail);
        setSelectionState("warning");
        break;
    }
  }

  /** Send an intent, remembering its verb for the lifecycle status. */
  function sendIntent(intent: object): void {
    const { id, verb } = intent as { id?: string; verb?: string };
    if (typeof id === "string" && typeof verb === "string") {
      verbs.set(id, verb);
    }
    daemon.send(intent);
  }

  const daemon = connect(
    config.daemonUrl,
    config.token,
    (message) => {
      routeServerMessage(tracker, message, (txId, observed) => {
        daemon.send({
          v: 1,
          id: crypto.randomUUID(),
          type: "reconcile-observe",
          txId,
          observed,
        });
      });
      if (isSelectOk(message)) inspector.show(message, selected?.element ?? null);
      applyTxState(message);
    },
    (state) => setConnectionState(state),
  );

  /** Select an instrumented element: draw chrome and tell the daemon. */
  function select(hit: Resolved): void {
    selected = hit;
    clearHover();
    drawSelection(hit.element);
    setSelectionState("idle");
    daemon.send({
      v: 1,
      id: crypto.randomUUID(),
      type: "select",
      selection: { path: hit.path, instanceIndex: hit.instanceIndex },
    });
  }

  // Clicking a ladder rung re-selects that ancestor.
  const inspector = new Inspector(
    document,
    (intent) => sendIntent(intent),
    (rung) => {
      const element = findInstance(document, rung.path, rung.instanceIndex);
      const hit = element ? hitTest(element) : null;
      if (hit) select(hit);
    },
  );

  // Multi-selection set — Cmd/Ctrl+click on instrumented elements grows it.
  // Plain clicks reset it to the single clicked element.
  const multi = new MultiSelection();
  multi.subscribe(() => {
    if (multi.size > 1) {
      inspector.setMultiMode(multi.size, (className) => {
        for (const sel of multi.list()) {
          sendIntent({
            v: 1,
            id: crypto.randomUUID(),
            type: "intent",
            verb: "set-class",
            selection: sel,
            state: {},
            add: [className],
            remove: [],
          });
        }
      });
    } else {
      inspector.clearMultiMode();
    }
  });

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Clicks inside the inspector panel are edit gestures, not selections.
      if (target.closest(`#${INSPECTOR_ID}`)) return;

      const hit = hitTest(target);
      if (!hit) {
        selected = null;
        multi.clear();
        clearSelection();
        inspector.hide();
        return;
      }

      // Intercept the click — in the dev page a click is a selection gesture.
      event.preventDefault();
      event.stopPropagation();
      const sel = { path: hit.path, instanceIndex: hit.instanceIndex };
      if (event.metaKey || event.ctrlKey) {
        multi.toggle(sel);
        // Don't replace the primary selection in multi mode — keep the
        // single inspector view on the most recently single-clicked one.
        return;
      }
      // Plain click: reset multi to just this one and proceed with single
      // selection as before.
      multi.setOne(sel);
      select(hit);
    },
    true,
  );

  // Hover preview — a faint frame on what a click would select.
  document.addEventListener("pointerover", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`#${INSPECTOR_ID}`)) {
      clearHover();
      return;
    }
    const hit = hitTest(target);
    if (!hit || hit.element === selected?.element) {
      clearHover();
      return;
    }
    drawHover(hit.element);
  });
  document.addEventListener("pointerleave", () => clearHover());

  // Keyboard shortcuts: d/Del/Backspace/Esc/t/c on the current selection.
  installKeyboardShortcuts(document, {
    getSelection: () =>
      selected
        ? { path: selected.path, instanceIndex: selected.instanceIndex }
        : null,
    sendIntent,
    deselect: () => {
      selected = null;
      clearSelection();
      inspector.hide();
    },
    inspectorRoot: () => document.getElementById(INSPECTOR_ID),
  });

  // Arrow-key nudge: one Tailwind margin step per press in the arrow direction.
  installArrowKeyNudge(document, {
    getSelection: () =>
      selected
        ? { path: selected.path, instanceIndex: selected.instanceIndex }
        : null,
    getSelectedElement: () => selected?.element ?? null,
    sendIntent,
  });

  // Drag-to-reorder: drag the selected element onto an adjacent sibling to
  // swap them. Maps to the existing `move` verb.
  installDragReorder(document, {
    getSelected: () =>
      selected
        ? {
            element: selected.element,
            selection: {
              path: selected.path,
              instanceIndex: selected.instanceIndex,
            },
          }
        : null,
    sendIntent,
  });

  // Keep the selection chrome aligned when the layout shifts.
  const realign = (): void => {
    if (selected) drawSelection(selected.element);
  };
  window.addEventListener("resize", realign);
  window.addEventListener(
    "scroll",
    () => {
      realign();
      clearHover();
    },
    true,
  );

  return { sendIntent };
}

export { hitTest, ladder } from "./resolve.js";
export { editText, setClass, replaceAsset } from "./intent.js";
export { OptimisticTracker, routeServerMessage } from "./optimistic.js";
export { applyMutation, revertMutation, observe } from "./patch.js";
export { Inspector } from "./inspector.js";
export { injectStyles } from "./styles.js";
