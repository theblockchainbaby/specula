/**
 * The `select` handler — resolves an overlay selection against the source map
 * and builds the `select-ok` reply (`specs/protocol.md`).
 */

import type { SelectOk, SelectRequest } from "./protocol.js";
import type { SourceMap } from "./source-map.js";

/**
 * Build a `select-ok` reply for a `select` request, or `undefined` if the
 * selected path is not in the source map (a stale or unknown selection).
 */
export function handleSelect(
  map: SourceMap,
  request: SelectRequest,
): SelectOk | undefined {
  const entry = map.resolve(request.selection.path);
  if (!entry) return undefined;

  const ladder = map.ladder(request.selection.path).map((rung) => ({
    selection: { path: rung.path, instanceIndex: 0 },
    label: rung.tag,
  }));

  // What the inspector can edit, from the analyze pass.
  const editable: SelectOk["editable"] = {};
  if (entry.text !== undefined) {
    editable.text = { value: entry.text, isDynamic: false };
  }
  if (entry.className !== undefined) {
    editable.classes = {
      base: entry.className.split(/\s+/).filter(Boolean),
    };
  }
  if (entry.src !== undefined) {
    editable.asset = { src: entry.src, resolved: entry.src };
  }

  return {
    v: 1,
    id: request.id,
    type: "select-ok",
    selection: request.selection,
    env: entry.env,
    tier: "A",
    editable,
    ladder,
    blastRadius: {
      domInstances: 1,
      sourceFiles: [entry.file],
      affectedPaths: [entry.path],
    },
  };
}
