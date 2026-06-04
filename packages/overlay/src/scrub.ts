/**
 * Style scrubbing — hover a Tailwind class chip and scroll the mouse wheel to
 * cycle through related values (text-[44px] → text-[45px], mt-8 → mt-9,
 * rounded-lg → rounded-xl). Each tick is one `set-class` verb, so source
 * stays in lockstep.
 *
 * Three class families are recognized in v1:
 *
 *  - `integer`     — `mt-N`, `p-2`, `gap-4`, `w-8`, etc. Walks Tailwind's
 *                    non-linear spacing scale (1..12, 14, 16, 20, 24, ...).
 *                    Negative variants supported.
 *  - `arbitrary`   — `text-[44px]`, `w-[200px]`. Bumps the inner number by 1.
 *  - `named`       — `text-{xs|sm|base|lg|xl|2xl|...}`, `rounded-{sm|md|...}`.
 *                    Walks the family's named index, clamped at the ends.
 *
 * Everything else (`flex`, `uppercase`, `font-bold`, …) returns `null` from
 * `parseScrubbable` and is silently skipped.
 */

// --- type model ------------------------------------------------------------

export type Scrubbable =
  | {
      kind: "integer";
      /** e.g. `"mt-"`, `"p-"`, `"gap-"`. Always ends in `-`. */
      prefix: string;
      /** The unsigned integer value. */
      value: number;
      /** True for `-mt-2` style classes; the class is `-${prefix}${value}`. */
      negative: boolean;
    }
  | {
      kind: "arbitrary";
      /** e.g. `"text-["`. Always ends in `[`. */
      prefix: string;
      /** The numeric value inside the brackets. */
      value: number;
      /** The unit suffix, e.g. `"px"`, `"rem"`. */
      unit: string;
    }
  | {
      kind: "named";
      family: NamedFamily;
      /** Original class — needed because some families share a prefix. */
      original: string;
      /** Index into the family's scale (0-based, low → high). */
      index: number;
    };

type NamedFamily = keyof typeof NAMED_FAMILIES;

// --- named scales ----------------------------------------------------------

/**
 * Named-tier scales — value lists, low → high. Adding a new family is a
 * single entry here.
 */
const NAMED_FAMILIES = {
  "text-size": ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"],
  "rounded": ["none", "sm", "", "md", "lg", "xl", "2xl", "3xl", "full"],
  "shadow": ["none", "sm", "", "md", "lg", "xl", "2xl", "inner"],
  "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
  "leading": ["none", "tight", "snug", "normal", "relaxed", "loose"],
  "tracking": ["tighter", "tight", "normal", "wide", "wider", "widest"],
} as const;

/** Tailwind's default spacing scale (used by mt/p/gap/w/h/…). */
const SPACING_SCALE = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64,
  72, 80, 96,
];

/**
 * Integer-spacing prefixes (`mt-`, `p-`, etc.). When a class matches one of
 * these followed by a digit, we treat it as a spacing-scale step.
 */
const INTEGER_PREFIXES = [
  "mt-", "mb-", "ml-", "mr-", "mx-", "my-", "m-",
  "pt-", "pb-", "pl-", "pr-", "px-", "py-", "p-",
  "gap-", "gap-x-", "gap-y-",
  "w-", "h-", "min-w-", "min-h-", "max-w-", "max-h-",
  "top-", "right-", "bottom-", "left-",
  "inset-", "inset-x-", "inset-y-",
  "space-x-", "space-y-",
];

// --- parseScrubbable -------------------------------------------------------

export function parseScrubbable(cls: string): Scrubbable | null {
  // Integer scales (and their negative variants).
  const negMatch = cls.match(/^-([a-z-]+-)(\d+)$/);
  if (negMatch && INTEGER_PREFIXES.includes(negMatch[1])) {
    return {
      kind: "integer",
      prefix: negMatch[1],
      value: Number(negMatch[2]),
      negative: true,
    };
  }
  const posMatch = cls.match(/^([a-z-]+-)(\d+)$/);
  if (posMatch && INTEGER_PREFIXES.includes(posMatch[1])) {
    return {
      kind: "integer",
      prefix: posMatch[1],
      value: Number(posMatch[2]),
      negative: false,
    };
  }

  // Arbitrary values: `prefix-[<number><unit>]`.
  const arbMatch = cls.match(/^([a-z-]+-)\[(\d+(?:\.\d+)?)([a-z%]*)\]$/);
  if (arbMatch) {
    return {
      kind: "arbitrary",
      prefix: `${arbMatch[1]}[`,
      value: Number(arbMatch[2]),
      unit: arbMatch[3],
    };
  }

  // Named scales. Match against each family's prefix.
  for (const family of Object.keys(NAMED_FAMILIES) as NamedFamily[]) {
    const prefix = familyPrefix(family);
    if (!cls.startsWith(prefix)) continue;
    const suffix = cls.slice(prefix.length);
    const scale = NAMED_FAMILIES[family];
    const idx = (scale as readonly string[]).indexOf(suffix);
    if (idx === -1) continue;
    return { kind: "named", family, original: cls, index: idx };
  }
  // Bare-family classes like `rounded` / `shadow` map to the implicit-empty entry.
  for (const family of Object.keys(NAMED_FAMILIES) as NamedFamily[]) {
    const prefix = familyPrefix(family);
    const bare = prefix.replace(/-$/, "");
    if (cls === bare) {
      const scale = NAMED_FAMILIES[family];
      const idx = (scale as readonly string[]).indexOf("");
      if (idx === -1) continue;
      return { kind: "named", family, original: cls, index: idx };
    }
  }

  return null;
}

function familyPrefix(family: NamedFamily): string {
  // text-size's classes are `text-{lg|xl|...}`. The other families' names
  // already match the class prefix.
  if (family === "text-size") return "text-";
  return `${family}-`;
}

// --- bumpClass -------------------------------------------------------------

export function bumpClass(s: Scrubbable, delta: 1 | -1): string | null {
  switch (s.kind) {
    case "integer": {
      const idx = SPACING_SCALE.indexOf(s.value);
      const nextIdx = idx === -1 ? -1 : idx + (s.negative ? -delta : delta);
      // Walking off the bottom of the scale (value goes to 0 or past it) is
      // the "remove the class" case.
      if (nextIdx < 0) return null;
      const next = nextIdx < SPACING_SCALE.length ? SPACING_SCALE[nextIdx] : null;
      if (next === null) return null;
      if (next === 0) return null;
      return s.negative ? `-${s.prefix}${next}` : `${s.prefix}${next}`;
    }
    case "arbitrary": {
      const next = s.value + delta;
      if (next <= 0) return null;
      return `${s.prefix}${next}${s.unit}]`;
    }
    case "named": {
      const scale = NAMED_FAMILIES[s.family];
      const next = Math.max(0, Math.min(scale.length - 1, s.index + delta));
      const suffix = scale[next];
      const prefix = familyPrefix(s.family);
      // Bare-family case: an empty suffix means the implicit class
      // (`rounded`, `shadow`). For new classes we emit it as `rounded` rather
      // than `rounded-`.
      return suffix === "" ? prefix.replace(/-$/, "") : `${prefix}${suffix}`;
    }
  }
}
