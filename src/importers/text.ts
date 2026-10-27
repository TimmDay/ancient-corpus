const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "de",
  "et",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
])

/** `LIBER NŌNUS` → `Liber Nōnus`; small words stay lower case after the first. */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) =>
      i > 0 && SMALL_WORDS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ")
}
