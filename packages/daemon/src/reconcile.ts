/**
 * The reconcile comparator — Tier-A's correction check (`specs/verification.md`).
 *
 * It asks "was the intent satisfied?", not "is the DOM byte-identical?". The
 * daemon may write a different-but-equivalent class string, and `next/image`
 * rewrites `src` — literal comparison would flag those as divergences.
 */

import type { DomMutation } from "./protocol.js";

/**
 * Compare the intended mutation against what was observed in the re-rendered
 * DOM. `true` means the intent landed; `false` is a reconcile divergence.
 */
export function reconcileMatches(
  intended: DomMutation,
  observed: DomMutation,
): boolean {
  if (intended.kind !== observed.kind) return false;

  if (intended.kind === "text" && observed.kind === "text") {
    return intended.text === observed.text;
  }
  if (intended.kind === "class" && observed.kind === "class") {
    // Class lists are compared as sets — order and whitespace do not matter.
    return sameClasses(intended.className, observed.className);
  }
  if (intended.kind === "attr" && observed.kind === "attr") {
    if (intended.name !== observed.name) return false;
    // `src` is intent-compared: a `next/image` URL embeds the real asset.
    return intended.name === "src"
      ? sameAsset(intended.value, observed.value)
      : intended.value === observed.value;
  }
  return false;
}

function sameClasses(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value.split(/\s+/).filter(Boolean).sort().join(" ");
  return normalize(a) === normalize(b);
}

/** `next/image` rewrites `src` to `/_next/image?url=<encoded>&w=…`. Decode the
 *  `url` parameter so the asset, not the wrapper URL, is what is compared. */
function sameAsset(intended: string, observed: string): boolean {
  return observed === intended || decodedAssetUrl(observed) === intended;
}

function decodedAssetUrl(src: string): string {
  const match = src.match(/[?&]url=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : src;
}
