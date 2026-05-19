# Contract 2 — Intent Protocol

*The verb vocabulary, message shapes, and the transaction lifecycle.*

The overlay speaks **intent**, never implementation — it never touches files. The
daemon resolves intent into an AST mutation, verifies it, and writes it.

## Transport & sessions

- **Overlay ↔ daemon** — WebSocket, `ws://127.0.0.1:<port>`.
- **VS Code extension ↔ daemon** — HTTP on the same loopback port.

### Handshake & origin guard

A localhost WebSocket is reachable by *any* page in the browser, including a
hostile tab (DNS-rebinding / CSRF-to-localhost). The daemon therefore:

1. On start, generates a 256-bit session token, writes it to `.specula/session`
   (gitignored), and exposes it to the injected overlay via the dev server.
2. **Rejects** any WS connection whose `Origin` is not the dev server's origin.
3. **Rejects** any connection whose first message is not a valid `hello` carrying
   the current session token.

## Verb vocabulary (v1)

**Mutating** — all Tier A in v1:

| Verb | Effect |
| --- | --- |
| `edit-text` | replace a JSX text node's literal content |
| `set-style` | set a style property; the daemon lowers it to classes via the style adapter |
| `set-class` | add / remove Tailwind classes for a given state (the class inspector's low-level verb) |
| `replace-asset` | swap an image `src`, uploading the asset into `public/` |

**Non-mutating** — `hello`, `select`.

**Daemon → overlay pushes** — `intent-ack`, `intent-committed`, `intent-failed`,
`intent-warning`, `rekey`, `file-changed`.

**Reserved, not implemented in v1** — `move`, `duplicate`, `delete`, `wrap`,
`extract-component`, `bind-data`, and the Tier D agent verbs. The envelope `v`
field permits additive evolution without breaking older clients.

## Message schemas

```ts
// ===== Envelope =====
interface Envelope {
  v: 1;
  id: string;        // uuid; responses and lifecycle pushes echo the originating id
}

// ===== Shared types =====
interface Selection {
  path: string;          // identity path — see identity.md
  instanceIndex: number; // 0 unless the path is a .map()ed element
}

interface StyleState {                       // base state == {}
  variant?: "hover" | "focus" | "focus-visible" | "active";
  breakpoint?: "sm" | "md" | "lg" | "xl" | "2xl";
  scheme?: "light" | "dark";
}                                            // the Tailwind adapter owns prefix ordering

type Tier = "A" | "B" | "C" | "D";

interface BlastRadius {
  domInstances: number;   // how many DOM nodes this source edit changes
  sourceFiles: string[];  // files the edit writes
  affectedPaths: string[];
}

// ===== Handshake =====
interface Hello extends Envelope {
  type: "hello";
  token: string;
  client: "overlay" | "vscode";
  url?: string;
}
interface HelloOk extends Envelope {
  type: "hello-ok";
  project: { framework: string; styleSystem: string; root: string };
  mapVersion: string;
}

// ===== Select (non-mutating) =====
interface SelectRequest extends Envelope {
  type: "select";
  selection: Selection;
}
interface SelectOk extends Envelope {
  type: "select-ok";
  selection: Selection;
  env: "server" | "client";
  tier: Tier;                                 // tier the next edit here will run in
  editable: {
    text?:    { value: string; isDynamic: boolean };
    classes?: Record<string, string[]>;       // state-key -> class list
    asset?:   { src: string; resolved: string };
  };
  ladder: { selection: Selection; label: string }[];   // self -> ... -> page
  blastRadius: BlastRadius;
}

// ===== Intents (mutating; all Tier A in v1) =====
interface IntentBase extends Envelope {
  type: "intent";
  selection: Selection;
}
interface EditTextIntent extends IntentBase {
  verb: "edit-text";
  text: string;
}
interface SetClassIntent extends IntentBase {
  verb: "set-class";
  state: StyleState;
  add?: string[];
  remove?: string[];
}
interface SetStyleIntent extends IntentBase {
  verb: "set-style";                          // lowered to set-class by the adapter
  state: StyleState;
  property: string;
  value: string;
}
interface ReplaceAssetIntent extends IntentBase {
  verb: "replace-asset";
  asset: { name: string; dataBase64: string } | { url: string };
}
type Intent = EditTextIntent | SetClassIntent | SetStyleIntent | ReplaceAssetIntent;

// ===== Transaction lifecycle (daemon -> overlay) =====
type DomMutation =
  | { kind: "text";  path: string; instanceIndex: number; text: string }
  | { kind: "class"; path: string; instanceIndex: number; className: string }
  | { kind: "attr";  path: string; instanceIndex: number; name: string; value: string };

interface IntentAck extends Envelope {
  type: "intent-ack";
  txId: string;
  tier: Tier;
  blastRadius: BlastRadius;
  optimistic?: DomMutation;     // Tier A only — overlay applies it immediately
}
interface IntentCommitted extends Envelope {
  type: "intent-committed";
  txId: string;
  rekey: RekeyEntry[];          // usually empty for Tier A
  diff: { file: string; before: string; after: string }[];
}
interface IntentFailed extends Envelope {
  type: "intent-failed";
  txId: string;
  reason: "stale" | "parse-error" | "compile-error" | "runtime-error" | "internal";
  detail: string;
  revertOptimistic: true;
}
interface IntentWarning extends Envelope {
  type: "intent-warning";
  txId: string;
  reason: "type-error" | "reconcile-divergence";
  detail: string;               // file is committed; overlay offers one-click revert
}

// ===== Reconcile (overlay -> daemon) =====
interface ReconcileObserve extends Envelope {
  type: "reconcile-observe";
  txId: string;
  observed: DomMutation;        // post-reconcile actual state of the edited node
}

// ===== Pushes (daemon -> overlay) =====
interface RekeyEntry { from: string; to: string | null; }   // null = correlation lost
interface Rekey extends Envelope {
  type: "rekey";
  entries: RekeyEntry[];
  mapVersion: string;
}
interface FileChanged extends Envelope {
  type: "file-changed";
  file: string;
  source: "human" | "specula";
}
```

## The transaction lifecycle

Every mutating intent is a transaction. Ten steps:

1. **intent** — overlay → daemon.
2. **classify** — daemon resolves the target file(s) and AST node, computes the
   tier and the blast radius, builds the edit plan.
3. **intent-ack** — daemon → overlay: tier, blast radius, and (Tier A) the exact
   optimistic `DomMutation`. The overlay applies the optimistic patch **now**; the
   user sees the change instantly.
4. **stage** — daemon snapshots the target file content in memory, keyed by `txId`.
5. **staleness gate** — daemon re-reads and re-hashes the target file. If it
   changed since the map was built, the daemon re-parses and re-resolves the path;
   if the node is gone or ambiguous → `intent-failed: stale`. *Never write against
   a stale parse.*
6. **apply** — AST mutation → project formatter (Prettier/Biome) → write.
7. **verify** — the gates in [verification.md](verification.md): parse, render,
   reconcile.
8. **observe** — for Tier A the overlay sends `reconcile-observe` with the
   post-reconcile state of the edited node.
9. **commit / rollback** — `intent-committed` (drop the snapshot) or
   `intent-failed` (restore the snapshot; overlay reverts the optimistic patch).
10. **async typecheck** — Tier A: `tsc` runs *after* commit; failure →
    `intent-warning: type-error` with one-click revert.

### Serialization & coalescing

- Transactions are **serialized per file** — never two concurrent writes to one
  file.
- Intents for the **same `{path, verb, property/state}`** that queue while a
  transaction is in flight **coalesce to the latest** — a user dragging a slider
  produces one committed edit, not forty. This also bounds verification cost.

### The two correction loops

Specula has two correction mechanisms for two problem shapes — keep them separate:

- **Reconcile-diff** (Tier A) — optimistic DOM vs. authoritative re-render,
  compared *semantically* (see [verification.md](verification.md)). Cheap,
  automatic, every edit.
- **Screenshot-vision** (Tier D) — a separate mechanism with capped retries.
  It **never** runs on Tier A — it would multiply latency and cost on the most
  frequent operation. Out of scope for v1; reserved by the protocol.
