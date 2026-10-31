// The Locator contract shared by the build, the reader script, /cite and any
// future consumer. Everything that turns a Locator someone typed into a place
// in an Edition goes through here, so every client resolves links the same way.

/** One addressable place in an Edition: a Passage, or a division such as a book or Life. */
export type LocatorTarget = {
  /** The canonical Locator, e.g. `9.9` or `Augustus 5`. */
  locator: string
  /** The HTML id of the element that holds it. */
  id: string
  /** The page it is on, when an Edition is read a book at a time; otherwise this page. */
  page?: string
}

/**
 * What a reader page needs to resolve Locators: every target in document
 * order, plus the Work's Locator aliases (`gaius` → `caligula`), keyed on
 * normalized tokens.
 */
export type LocatorIndex = {
  targets: LocatorTarget[]
  aliases: Record<string, string>
  /**
   * For targets that share a Locator but for a bracketed name (`80.1` and
   * `80.1(Alexander)`), keyed by id: what tells each apart, for asking which
   * one a link meant.
   */
  choices?: Record<string, Choice>
  /**
   * The Work's Passages are named by their first line (`13.13`), so a Locator
   * naming a line inside one (`13.15`) lands on the Passage that holds it.
   */
  lines?: true
}

export type Choice = {
  /** What this one is, e.g. "From the reign of Severus Alexander…". */
  what: string
  /** The start of its text. */
  excerpt: string
}

export type Resolution =
  | {
      kind: "found"
      /** The target the link lands on (its start, for a range). */
      start: LocatorTarget
      /** The last target of a range, when the link names one that exists. */
      end?: LocatorTarget
      /** False when the requested Locator was more precise than the Edition and we fell back. */
      exact: boolean
      /**
       * Other targets the link could equally mean, because it left out the
       * bracketed name that tells them apart (`80.1` for `80.1(Alexander)`).
       */
      alternatives?: LocatorTarget[]
    }
  | { kind: "not-found" }

const RANGE_SEPARATOR = /\s*[–—-]\s*/
const ROMAN = /^(m{0,3})(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/

/** The HTML id for a canonical Locator: whitespace becomes `-`, everything else is kept. */
export function locatorId(locator: string): string {
  return locator.trim().replace(/\s+/g, "-")
}

/**
 * Splits a Locator as written into comparable tokens: case and diacritics are
 * ignored, a leading "Life of" is dropped (a collection of Lives is cited by the
 * subject's name), and `.`, `,`, `:`, `§`, `-` between tokens all mean the same thing.
 *
 * A bracketed name tells apart a run of chapters that starts again within a book
 * (`80.1(Alexander)`). Its tokens go straight after the book's, so a more precise
 * `80.1.2(Alexander)` still falls back to `80.1(Alexander)`, not to `80.1`.
 */
export function locatorTokens(written: string): string[] {
  const qualifiers: string[] = []
  const plain = written
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^\s*(the\s+)?life\s+of\s+(the\s+)?/, "")
    .replace(/\(([^)]*)\)/g, (_, name: string) => {
      qualifiers.push(...name.split(/\s+/).filter(Boolean))
      return " "
    })
  const tokens = plain.split(/[\s.,:;§]+|(?<=\D)-|-(?=\D)/).filter(Boolean)
  const allNumeric = tokens.every((t) => /^\d+$/.test(t) || isRoman(t))
  // A Roman numeral is only read as a number where it can't be a name: after
  // the first token, or when every token is a number (`IX.9`).
  const read = tokens.map((t, i) =>
    (i > 0 || allNumeric) && isRoman(t) ? String(romanValue(t)) : t,
  )
  return [...read.slice(0, 1), ...qualifiers, ...read.slice(1)]
}

/** Resolves a Locator as someone wrote it (raw, possibly URL-encoded) against an Edition's index. */
export function resolveLocator(
  written: string,
  index: LocatorIndex,
): Resolution {
  const decoded = safeDecode(written).trim()
  if (!decoded) return { kind: "not-found" }

  // A Passage printed in parts is found at its first part.
  const byKey = new Map(
    index.targets.toReversed().map((t) => [keyOf(locatorTokens(t.locator)), t]),
  )
  const [startWritten = "", endWritten] = splitRange(decoded)
  const startTokens = applyAliases(locatorTokens(startWritten), index.aliases)

  for (let length = startTokens.length; length > 0; length--) {
    const full = length === startTokens.length
    const named = byKey.get(keyOf(startTokens.slice(0, length)))
    const start = named ?? (full ? lineWithin(startTokens, index) : undefined)
    if (!start) continue
    const exact = full && start === named
    const end =
      full && endWritten
        ? rangeEnd(startTokens, endWritten, byKey, index)
        : undefined
    const alternatives = startWritten.includes("(") ? [] : twinsOf(start, index)
    return {
      kind: "found",
      start,
      ...(end && end !== start ? { end } : {}),
      exact,
      ...(alternatives.length ? { alternatives } : {}),
    }
  }
  return { kind: "not-found" }
}

/** The targets a resolution covers, in document order, for highlighting. */
export function resolvedTargets(
  resolution: Resolution,
  index: LocatorIndex,
): LocatorTarget[] {
  if (resolution.kind !== "found") return []
  const { start, end } = resolution
  const partsOf = (locator: string) =>
    index.targets.filter((t) => t.locator === locator)
  // A single Passage the source prints in parts lights up every part.
  if (!end) return partsOf(start.locator)
  // A range within one division covers its numbers wherever the source
  // prints them, starting with the start so a link lands there.
  const inRange = numberedBetween(start.locator, end.locator)
  if (inRange) {
    return [
      ...partsOf(start.locator),
      ...index.targets.filter(
        (t) => t.locator !== start.locator && inRange(t.locator),
      ),
    ]
  }
  const from = index.targets.indexOf(start)
  const to = index.targets.indexOf(end)
  return to >= from ? index.targets.slice(from, to + 1) : [start]
}

/**
 * For two Locators that differ only in their last number (`72.10` and
 * `72.14`), a test for Locators numbered between them in the same division.
 */
function numberedBetween(
  start: string,
  end: string,
): ((locator: string) => boolean) | undefined {
  const [a, b] = [locatorTokens(start), locatorTokens(end)]
  const prefix = keyOf(a.slice(0, -1))
  const [low, high] = [Number(a.at(-1)), Number(b.at(-1))]
  if (
    a.length !== b.length ||
    prefix !== keyOf(b.slice(0, -1)) ||
    !Number.isInteger(low) ||
    !Number.isInteger(high)
  )
    return undefined
  return (locator) => {
    const tokens = locatorTokens(locator)
    const n = Number(tokens.at(-1))
    return (
      tokens.length === a.length &&
      keyOf(tokens.slice(0, -1)) === prefix &&
      n >= low &&
      n <= high
    )
  }
}

/** Targets whose Locator differs from this one only by a bracketed name. */
function twinsOf(target: LocatorTarget, index: LocatorIndex): LocatorTarget[] {
  const bare = (locator: string) =>
    keyOf(locatorTokens(locator.replace(/\([^)]*\)/g, "")))
  const key = bare(target.locator)
  return index.targets.filter(
    (t) => t.locator !== target.locator && bare(t.locator) === key,
  )
}

function rangeEnd(
  startTokens: string[],
  endWritten: string,
  byKey: Map<string, LocatorTarget>,
  index: LocatorIndex,
): LocatorTarget | undefined {
  const endTokens = applyAliases(locatorTokens(endWritten), index.aliases)
  // An abbreviated end (`9.9–10`, `Aurelian 25.2–4`) replaces the trailing
  // tokens of the start; a full end (`Augustus 5–Augustus 7`) stands alone.
  const full =
    endTokens.length >= startTokens.length
      ? endTokens
      : [
          ...startTokens.slice(0, startTokens.length - endTokens.length),
          ...endTokens,
        ]
  for (let length = full.length; length > 0; length--) {
    const end =
      byKey.get(keyOf(full.slice(0, length))) ??
      (length === full.length ? lineWithin(full, index) : undefined)
    if (end) return end
  }
  return undefined
}

/**
 * In a Work numbered by lines, the Passage holding the line a Locator names:
 * the one in the same division whose first line is the latest at or before it.
 */
function lineWithin(
  tokens: string[],
  index: LocatorIndex,
): LocatorTarget | undefined {
  const line = Number(tokens.at(-1))
  if (!index.lines || !Number.isInteger(line)) return undefined
  const prefix = keyOf(tokens.slice(0, -1))
  let best: { target: LocatorTarget; first: number } | undefined
  for (const target of index.targets) {
    const own = locatorTokens(target.locator)
    const first = Number(own.at(-1))
    if (
      own.length === tokens.length &&
      keyOf(own.slice(0, -1)) === prefix &&
      first <= line &&
      first > (best?.first ?? -Infinity)
    )
      best = { target, first }
  }
  return best?.target
}

function splitRange(written: string): [string, string?] {
  // Only a dash between two numbers is a range; `Pseudo-Aurelius` is a name.
  const match = written.match(/^(.*\d)\s*[–—-]\s*([^–—-]*\d.*)$/)
  if (!match?.[1] || !match[2]) return [written]
  const [start, end] = [match[1], match[2]]
  return RANGE_SEPARATOR.test(end) ? [written] : [start, end]
}

function applyAliases(
  tokens: string[],
  aliases: Record<string, string>,
): string[] {
  // An alias names a division (`gaius` → `caligula`, `life of the three gordians` → ...),
  // so try the longest leading run of tokens first.
  for (let length = tokens.length; length > 0; length--) {
    const replacement = aliases[keyOf(tokens.slice(0, length))]
    if (replacement !== undefined)
      return [...locatorTokens(replacement), ...tokens.slice(length)]
  }
  return tokens
}

/** The lookup key for a normalized alias or Locator. */
export function aliasKey(written: string): string {
  return keyOf(locatorTokens(written))
}

function keyOf(tokens: string[]): string {
  return tokens.join(".")
}

function isRoman(token: string): boolean {
  return token.length > 0 && ROMAN.test(token)
}

function romanValue(token: string): number {
  const values: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  }
  let total = 0
  for (let i = 0; i < token.length; i++) {
    const value = values[token[i] ?? ""] ?? 0
    const next = values[token[i + 1] ?? ""] ?? 0
    total += value < next ? -value : value
  }
  return total
}

function safeDecode(written: string): string {
  try {
    return decodeURIComponent(written.replace(/^#/, ""))
  } catch {
    return written.replace(/^#/, "")
  }
}
