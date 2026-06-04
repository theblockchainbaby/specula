/**
 * The selection inspector — a panel that turns a selected element's editable
 * surface (the `select-ok` payload) into edit gestures that emit intents, and
 * surfaces each transaction's state.
 *
 * It is browser DOM, but driven by pure data: `show()` takes a plain object
 * and the field handlers call back with protocol intents — both jsdom-testable.
 * The visual system lives in `styles.ts`; this module builds only structure.
 */

import {
  assetIntentFromFile,
  deleteElement,
  duplicateElement,
  editText,
  moveElement,
  setClass,
  setStyle,
  toggleConditional,
  unwrapElement,
  wrapElement,
} from "./intent.js";
import { bumpClass, parseScrubbable } from "./scrub.js";
import type { Intent, Selection } from "./intent.js";

/** The editable surface of a selected element — the `select-ok` payload. */
export interface Editable {
  text?: { value: string; isDynamic: boolean };
  classes?: Record<string, string[]>;
  asset?: { src: string; resolved: string };
}

/** One rung of the selection ladder. */
export interface LadderRung {
  selection: Selection;
  label: string;
}

/** The subset of a `select-ok` message the inspector needs. */
export interface SelectOk {
  selection: Selection;
  editable: Editable;
  /** `server` | `client` — the RSC environment, shown in the header. */
  env?: string;
  /** Ancestor chain, innermost first — the selection ladder. */
  ladder?: LadderRung[];
}

/** A transaction's lifecycle state, as surfaced in the inspector footer. */
export type TxState = "idle" | "loading" | "success" | "error" | "warning";

/** The panel's element id — clicks inside it are not selection gestures. */
export const INSPECTOR_ID = "specula-inspector";

/** A panel that renders a selection's editable fields and emits intents. */
export class Inspector {
  readonly #doc: Document;
  readonly #emit: (intent: Intent) => void;
  readonly #reselect: (selection: Selection) => void;

  constructor(
    doc: Document,
    emit: (intent: Intent) => void,
    reselect: (selection: Selection) => void = () => {},
  ) {
    this.#doc = doc;
    this.#emit = emit;
    this.#reselect = reselect;
  }

  /**
   * Render the panel for a selection's editable surface. `element` is the
   * selected DOM node — used for the header tag and to find `move` siblings.
   */
  show(selectOk: SelectOk, element: Element | null = null): void {
    const panel = this.#ensurePanel();
    panel.replaceChildren();
    panel.removeAttribute("data-busy");
    panel.style.display = "block";

    const { selection, editable } = selectOk;
    panel.appendChild(this.#header(selectOk, element));

    if (selectOk.ladder && selectOk.ladder.length > 1) {
      panel.appendChild(this.#ladderField(selectOk.ladder, selection.path));
    }

    const nothingEditable =
      !editable.text && !editable.classes?.base && !editable.asset;
    if (nothingEditable) panel.appendChild(this.#emptyNote(element));

    if (editable.text) {
      panel.appendChild(this.#textField(selection, editable.text));
    }
    if (editable.classes?.base) {
      panel.appendChild(this.#classField(selection, editable.classes.base));
    }
    panel.appendChild(this.#styleField(selection));
    if (editable.asset) {
      panel.appendChild(this.#assetField(selection, editable.asset.src));
    }
    panel.appendChild(this.#actionsField(selection, element));
    panel.appendChild(this.#footer());
  }

  /** Hide the panel. */
  hide(): void {
    const panel = this.#doc.getElementById(INSPECTOR_ID);
    if (panel) panel.style.display = "none";
  }

  /**
   * Reflect a transaction's lifecycle state in the panel — the footer message,
   * the header dot, and (while `loading`) the inert overlay on the sections.
   */
  setStatus(state: TxState, verb?: string, detail?: string): void {
    const panel = this.#doc.getElementById(INSPECTOR_ID);
    if (!panel) return;

    const footer = panel.querySelector<HTMLElement>("[data-specula-status]");
    if (footer) {
      footer.dataset.speculaStatus = state;
      const dot = footer.querySelector<HTMLElement>(".spc-dot");
      if (dot) dot.dataset.state = state;
      const msg = footer.querySelector<HTMLElement>(".spc-footer__msg");
      if (msg) msg.replaceChildren(...this.#statusNodes(state, verb, detail));
    }
    const headerDot = panel.querySelector<HTMLElement>(".spc-header .spc-dot");
    if (headerDot) headerDot.dataset.state = state;

    if (state === "loading") panel.dataset.busy = "true";
    else panel.removeAttribute("data-busy");
  }

  /** The header — a status dot, the element tag, the env badge, the path. */
  #header(selectOk: SelectOk, element: Element | null): HTMLElement {
    const header = this.#el("div", "spc-header");
    const row = this.#el("div", "spc-header__row");

    const dot = this.#el("span", "spc-dot");
    dot.dataset.state = "idle";
    const tag = this.#el("span", "spc-tag");
    tag.textContent = this.#tagOf(selectOk.selection.path, element);
    row.append(dot, tag);

    if (selectOk.env) {
      const env = this.#el("span", "spc-env");
      env.textContent = selectOk.env;
      row.appendChild(env);
    }
    header.appendChild(row);

    const path = this.#el("div", "spc-path");
    path.textContent = selectOk.selection.path;
    path.title = selectOk.selection.path;
    header.appendChild(path);
    return header;
  }

  /** A text input that emits `edit-text` on commit; inert if the text is dynamic. */
  #textField(
    selection: Selection,
    text: { value: string; isDynamic: boolean },
  ): HTMLElement {
    const section = this.#section("Text");
    const input = this.#el("input", "spc-input");
    input.type = "text";
    input.value = text.value;
    input.dataset.speculaField = "text";

    if (text.isDynamic) {
      input.disabled = true;
      input.title = "Dynamic expression — edit it in source";
      section.appendChild(input);
      section.appendChild(this.#hint("Dynamic value — not directly editable."));
    } else {
      const original = text.value;
      const commit = (): void => {
        if (input.value !== original) {
          this.#emit(editText(selection, input.value));
        }
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") commit();
      });
      input.addEventListener("blur", commit);
      section.appendChild(input);
    }
    return section;
  }

  /** Class chips (click to remove) plus an input to add — each emits `set-class`. */
  #classField(selection: Selection, classes: string[]): HTMLElement {
    const section = this.#section("Classes");

    const chips = this.#el("div", "spc-chips");
    for (const cls of classes) {
      const chip = this.#el("button", "spc-chip");
      chip.type = "button";
      chip.dataset.speculaClass = cls;
      const name = this.#el("span");
      name.textContent = cls;
      const remove = this.#el("span", "spc-chip__x");
      remove.textContent = "×";
      chip.append(name, remove);
      chip.addEventListener("click", () => {
        this.#emit(setClass(selection, {}, [], [cls]));
      });
      // Wheel scrub: scroll a chip to cycle through scrubbable values
      // (mt-N, text-[Npx], rounded-{lg|xl|…}). Each step emits a set-class
      // with both add and remove so the diff stays one-line. Threshold of
      // 30px filters trackpad jitter into discrete ticks.
      this.#installWheelScrub(chip, selection, cls);
      chips.appendChild(chip);
    }
    section.appendChild(chips);

    const adder = this.#el("input", "spc-input spc-input--mono");
    adder.type = "text";
    adder.placeholder = "add class…";
    adder.dataset.speculaField = "add-class";
    adder.addEventListener("keydown", (event) => {
      const value = adder.value.trim();
      if (event.key === "Enter" && value) {
        this.#emit(setClass(selection, {}, [value], []));
        adder.value = "";
      }
    });
    section.appendChild(adder);
    return section;
  }

  /**
   * Attach a wheel scrub handler to a class chip. Each ~30px of accumulated
   * wheel travel emits one `set-class` step in the appropriate direction.
   * The chip's current class is tracked locally because a single wheel
   * gesture can produce many steps before the inspector re-renders.
   */
  #installWheelScrub(
    chip: HTMLElement,
    selection: Selection,
    initialClass: string,
  ): void {
    const THRESHOLD = 30;
    let currentClass = initialClass;
    let scrubbable = parseScrubbable(currentClass);
    let accumulated = 0;
    chip.addEventListener("wheel", (event) => {
      if (!scrubbable) return;
      event.preventDefault();
      accumulated += event.deltaY;
      // Negative deltaY = wheel up = increase value (delta +1).
      while (accumulated <= -THRESHOLD && scrubbable) {
        accumulated += THRESHOLD;
        const next = bumpClass(scrubbable, +1);
        if (next === null) {
          this.#emit(setClass(selection, {}, [], [currentClass]));
          scrubbable = null;
          break;
        }
        this.#emit(setClass(selection, {}, [next], [currentClass]));
        currentClass = next;
        scrubbable = parseScrubbable(next);
      }
      while (accumulated >= THRESHOLD && scrubbable) {
        accumulated -= THRESHOLD;
        const next = bumpClass(scrubbable, -1);
        if (next === null) {
          this.#emit(setClass(selection, {}, [], [currentClass]));
          scrubbable = null;
          break;
        }
        this.#emit(setClass(selection, {}, [next], [currentClass]));
        currentClass = next;
        scrubbable = parseScrubbable(next);
      }
    });
  }

  /** A property + value pair that emits `set-style` on Enter. */
  #styleField(selection: Selection): HTMLElement {
    const section = this.#section("Style");
    const row = this.#el("div", "spc-input-row");

    const property = this.#el("input", "spc-input spc-input--mono spc-prop");
    property.type = "text";
    property.placeholder = "property";
    property.dataset.speculaField = "style-property";

    const value = this.#el("input", "spc-input spc-input--mono spc-val");
    value.type = "text";
    value.placeholder = "value";
    value.dataset.speculaField = "style-value";
    value.addEventListener("keydown", (event) => {
      const prop = property.value.trim();
      const val = value.value.trim();
      if (event.key === "Enter" && prop && val) {
        this.#emit(setStyle(selection, {}, prop, val));
        property.value = "";
        value.value = "";
      }
    });

    row.append(property, value);
    section.appendChild(row);
    return section;
  }

  /** The asset's current `src`, plus a file picker that emits `replace-asset`. */
  #assetField(selection: Selection, src: string): HTMLElement {
    const section = this.#section("Asset");

    const current = this.#el("div", "spc-path");
    current.textContent = src;
    current.title = src;
    section.appendChild(current);

    const input = this.#el("input", "spc-file");
    input.type = "file";
    input.accept = "image/*";
    input.dataset.speculaField = "asset";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) {
        void assetIntentFromFile(selection, file).then((intent) =>
          this.#emit(intent),
        );
      }
    });
    section.appendChild(input);
    return section;
  }

  /**
   * The selection ladder — a breadcrumb of the element's ancestors. Clicking a
   * rung re-selects that ancestor; the current rung is marked and inert.
   */
  #ladderField(ladder: LadderRung[], currentPath: string): HTMLElement {
    const section = this.#section("Selection");
    const nav = this.#el("div", "spc-ladder");

    // The ladder is innermost-first; show it outermost-first as a breadcrumb.
    [...ladder].reverse().forEach((rung, index) => {
      if (index > 0) {
        const sep = this.#el("span", "spc-rung-sep");
        sep.textContent = "›";
        nav.appendChild(sep);
      }
      const button = this.#el("button", "spc-rung");
      button.type = "button";
      button.textContent = rung.label;
      button.dataset.speculaRung = rung.selection.path;
      if (rung.selection.path === currentPath) {
        button.disabled = true;
        button.dataset.speculaCurrent = "true";
      } else {
        button.addEventListener("click", () => this.#reselect(rung.selection));
      }
      nav.appendChild(button);
    });
    section.appendChild(nav);
    return section;
  }

  /** Structural-verb buttons — delete, duplicate, wrap, and move up/down. */
  #actionsField(selection: Selection, element: Element | null): HTMLElement {
    const section = this.#section("Structure");
    const row = this.#el("div", "spc-actions");

    const add = (
      key: string,
      label: string,
      options: { danger?: boolean; disabled?: boolean; onClick: () => void },
    ): void => {
      const button = this.#el(
        "button",
        options.danger ? "spc-btn spc-btn--danger" : "spc-btn",
      );
      button.type = "button";
      button.textContent = label;
      button.dataset.speculaAction = key;
      if (options.disabled) {
        button.disabled = true;
      } else {
        button.addEventListener("click", options.onClick);
      }
      row.appendChild(button);
    };

    add("delete", "Delete", {
      danger: true,
      onClick: () => this.#emit(deleteElement(selection)),
    });
    add("duplicate", "Duplicate", {
      onClick: () => this.#emit(duplicateElement(selection)),
    });
    add("wrap", "Wrap", {
      onClick: () => this.#emit(wrapElement(selection, "div")),
    });
    // Unwrap is the inverse of Wrap. Enabled only when there's something
    // inside to keep after the wrapper is removed.
    add("unwrap", "Unwrap", {
      disabled: !element || element.children.length === 0,
      onClick: () => this.#emit(unwrapElement(selection)),
    });
    // Toggle the test of a `{… && <element>}` conditional. The button is
    // always offered; the planner returns None and rolls back when the
    // element isn't actually inside a supported conditional pattern.
    add("toggle", "Toggle", {
      onClick: () => this.#emit(toggleConditional(selection)),
    });

    const up = this.#sibling(element, "up");
    add("up", "Up", {
      disabled: !up,
      onClick: () => {
        if (up) this.#emit(moveElement(selection, up));
      },
    });
    const down = this.#sibling(element, "down");
    add("down", "Down", {
      disabled: !down,
      onClick: () => {
        if (down) this.#emit(moveElement(selection, down));
      },
    });

    section.appendChild(row);
    return section;
  }

  /** A note shown when an element has no directly editable text/class/asset. */
  #emptyNote(element: Element | null): HTMLElement {
    const note = this.#el("div", "spc-empty");
    note.dataset.speculaEmpty = "true";
    const what = element ? `<${element.tagName.toLowerCase()}>` : "this element";
    note.append(
      this.#doc.createTextNode(
        `No editable text, classes, or assets on ${what}. Use `,
      ),
      this.#bold("Structure"),
      this.#doc.createTextNode(" below, or select a child element."),
    );
    return note;
  }

  /** The status footer — idle (hidden) until `setStatus` reports a transaction. */
  #footer(): HTMLElement {
    const footer = this.#el("div", "spc-footer");
    footer.dataset.speculaStatus = "idle";
    const dot = this.#el("span", "spc-dot");
    dot.dataset.state = "idle";
    footer.append(dot, this.#el("span", "spc-footer__msg"));
    return footer;
  }

  /** The message nodes for a footer state — verb in mono, detail in prose. */
  #statusNodes(state: TxState, verb?: string, detail?: string): Node[] {
    const text = (value: string): Node => this.#doc.createTextNode(value);
    const verbNode = (): Node => {
      const node = this.#el("span", "spc-footer__verb");
      node.textContent = verb ?? "";
      return node;
    };
    const prefix = verb ? [verbNode(), text(" · ")] : [];
    switch (state) {
      case "loading":
        return verb ? [verbNode(), text(" · committing…")] : [text("committing…")];
      case "success":
        return verb ? [verbNode(), text(" · committed")] : [text("committed")];
      case "error":
        return [...prefix, text(`failed — ${detail ?? "internal error"}`)];
      case "warning":
        return [...prefix, text(detail ?? "needs attention")];
      case "idle":
        return [];
    }
  }

  /** The instrumented sibling above/below `element`, as a [`Selection`]. */
  #sibling(element: Element | null, direction: "up" | "down"): Selection | null {
    if (!element) return null;
    const sibling =
      direction === "up"
        ? element.previousElementSibling
        : element.nextElementSibling;
    const path = sibling?.getAttribute("data-spc");
    return path ? { path, instanceIndex: 0 } : null;
  }

  /** The element's tag — from the live node, else parsed from its path. */
  #tagOf(path: string, element: Element | null): string {
    if (element) return element.tagName.toLowerCase();
    const segment = path.split("/").pop() ?? "";
    const tag = segment.split(":")[0];
    return tag && !tag.includes("#") ? tag : "element";
  }

  /** A labelled section wrapper. */
  #section(label: string): HTMLElement {
    const section = this.#el("div", "spc-section");
    const heading = this.#el("span", "spc-section__label");
    heading.textContent = label;
    section.appendChild(heading);
    return section;
  }

  #hint(text: string): HTMLElement {
    const hint = this.#el("div", "spc-hint");
    hint.textContent = text;
    return hint;
  }

  #bold(text: string): HTMLElement {
    const bold = this.#el("b");
    bold.textContent = text;
    return bold;
  }

  /** Create an element, optionally with a class — typed by tag name. */
  #el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
  ): HTMLElementTagNameMap[K] {
    const node = this.#doc.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  #ensurePanel(): HTMLElement {
    const existing = this.#doc.getElementById(INSPECTOR_ID);
    if (existing) return existing;
    const panel = this.#el("div");
    panel.id = INSPECTOR_ID;
    this.#doc.body.appendChild(panel);
    return panel;
  }
}
