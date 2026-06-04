/**
 * The Specula intent protocol — the wire vocabulary between the browser
 * overlay and the daemon. This file is the real-code form of `specs/protocol.md`
 * and is the single source of truth for message shapes.
 */

// ===== Envelope =====

/** Every message carries the protocol version and a correlation id. */
export interface Envelope {
  v: 1;
  /** uuid; responses and lifecycle pushes echo the originating id. */
  id: string;
}

// ===== Shared types =====

/** A reference to a rendered element. `path` is the structural identity from
 *  `specs/identity.md`; `instanceIndex` discriminates `.map()`ed DOM nodes. */
export interface Selection {
  path: string;
  instanceIndex: number;
}

/** The style state an edit targets. The empty object is the base state; the
 *  Tailwind adapter owns prefix ordering. */
export interface StyleState {
  variant?: "hover" | "focus" | "focus-visible" | "active";
  breakpoint?: "sm" | "md" | "lg" | "xl" | "2xl";
  scheme?: "light" | "dark";
}

/** Latency tier — see `specs/verification.md`. v1 implements Tier A only. */
export type Tier = "A" | "B" | "C" | "D";

/** How far an edit reaches. */
export interface BlastRadius {
  /** DOM nodes this source edit changes (>1 for `.map()`ed elements). */
  domInstances: number;
  sourceFiles: string[];
  affectedPaths: string[];
}

// ===== Handshake =====

export interface Hello extends Envelope {
  type: "hello";
  token: string;
  client: "overlay" | "vscode";
  url?: string;
}

export interface HelloOk extends Envelope {
  type: "hello-ok";
  project: { framework: string; styleSystem: string; root: string };
  mapVersion: string;
}

// ===== Select (non-mutating) =====

export interface SelectRequest extends Envelope {
  type: "select";
  selection: Selection;
}

export interface SelectOk extends Envelope {
  type: "select-ok";
  selection: Selection;
  env: "server" | "client";
  /** Tier the next edit to this element will run in. */
  tier: Tier;
  editable: {
    text?: { value: string; isDynamic: boolean };
    /** state-key -> class list */
    classes?: Record<string, string[]>;
    asset?: { src: string; resolved: string };
  };
  /** self -> ... -> page */
  ladder: Array<{ selection: Selection; label: string }>;
  blastRadius: BlastRadius;
}

// ===== Intents (mutating; all Tier A in v1) =====

interface IntentBase extends Envelope {
  type: "intent";
  selection: Selection;
}

export interface EditTextIntent extends IntentBase {
  verb: "edit-text";
  text: string;
}

export interface SetClassIntent extends IntentBase {
  verb: "set-class";
  state: StyleState;
  add?: string[];
  remove?: string[];
}

export interface SetStyleIntent extends IntentBase {
  verb: "set-style";
  state: StyleState;
  property: string;
  value: string;
}

export interface ReplaceAssetIntent extends IntentBase {
  verb: "replace-asset";
  asset: { name: string; dataBase64: string } | { url: string };
}

// --- structural verbs (Tier B) ---

export interface DeleteIntent extends IntentBase {
  verb: "delete";
}

export interface DuplicateIntent extends IntentBase {
  verb: "duplicate";
}

export interface WrapIntent extends IntentBase {
  verb: "wrap";
  /** The tag to enclose the element in, e.g. `div`. */
  tag: string;
}

export interface UnwrapIntent extends IntentBase {
  verb: "unwrap";
}

export interface ToggleConditionalIntent extends IntentBase {
  verb: "toggle-conditional";
}

export interface MoveIntent extends IntentBase {
  verb: "move";
  /** The adjacent sibling to swap the element with. */
  sibling: Selection;
}

export type Intent =
  | EditTextIntent
  | SetClassIntent
  | SetStyleIntent
  | ReplaceAssetIntent
  | DeleteIntent
  | DuplicateIntent
  | WrapIntent
  | UnwrapIntent
  | ToggleConditionalIntent
  | MoveIntent;

// ===== Transaction lifecycle (daemon -> overlay) =====

export type DomMutation =
  | { kind: "text"; path: string; instanceIndex: number; text: string }
  | { kind: "class"; path: string; instanceIndex: number; className: string }
  | {
      kind: "attr";
      path: string;
      instanceIndex: number;
      name: string;
      value: string;
    };

export interface IntentAck extends Envelope {
  type: "intent-ack";
  txId: string;
  tier: Tier;
  blastRadius: BlastRadius;
  /** Tier A only — the overlay applies this immediately. */
  optimistic?: DomMutation;
}

export interface IntentCommitted extends Envelope {
  type: "intent-committed";
  txId: string;
  /** Path remapping after structure shifts — usually empty for Tier A. */
  rekey: RekeyEntry[];
  diff: Array<{ file: string; before: string; after: string }>;
}

export interface IntentFailed extends Envelope {
  type: "intent-failed";
  txId: string;
  reason: "stale" | "parse-error" | "compile-error" | "runtime-error" | "internal";
  detail: string;
  revertOptimistic: true;
}

export interface IntentWarning extends Envelope {
  type: "intent-warning";
  txId: string;
  reason: "type-error" | "reconcile-divergence";
  detail: string;
}

// ===== Reconcile (overlay -> daemon) =====

export interface ReconcileObserve extends Envelope {
  type: "reconcile-observe";
  txId: string;
  observed: DomMutation;
}

// ===== Pushes (daemon -> overlay) =====

/** `to: null` means the element could not be re-correlated after a structural
 *  edit — the overlay drops the selection. */
export interface RekeyEntry {
  from: string;
  to: string | null;
}

export interface Rekey extends Envelope {
  type: "rekey";
  entries: RekeyEntry[];
  mapVersion: string;
}

export interface FileChanged extends Envelope {
  type: "file-changed";
  file: string;
  source: "human" | "specula";
}

// ===== Unions =====

/** Anything the overlay can send the daemon. */
export type ClientMessage = Hello | SelectRequest | Intent | ReconcileObserve;

/** Anything the daemon can send the overlay. */
export type ServerMessage =
  | HelloOk
  | SelectOk
  | IntentAck
  | IntentCommitted
  | IntentFailed
  | IntentWarning
  | Rekey
  | FileChanged;
