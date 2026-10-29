// Sentences: a Passage's text split where the Edition's punctuation ends a
// sentence, numbered from 1. Not canonical (docs/adr/0004): counted on the fly,
// the same way by the reader and by the snapshot test, in whichever Edition a
// link opens. Magie's Latin starts sentences in lower case, so a break is a full
// stop, question or exclamation mark followed by a space, unless the word before
// it is an abbreviation.

/** Abbreviations that end in a full stop without ending a sentence, folded to lower case. */
const ABBREVIATIONS: Record<string, string[]> = {
  en: [
    "mr",
    "mrs",
    "dr",
    "st",
    "cf",
    "viz",
    "vol",
    "ch",
    "c",
    "ca",
    "i.e",
    "e.g",
    "b.c",
    "a.d",
    "a.u",
    "a.u.c",
    "pp",
    "p",
    "ff",
    "sc",
  ],
  la: [
    "cos",
    "coss",
    "kal",
    "a.d",
    "a.u.c",
    "pr",
    "procos",
    "trib",
    "pl",
    "ti",
    "tib",
    "cn",
    "sp",
    "ser",
    "sex",
    "ap",
    "mam",
    "app",
    "c",
    "m'",
  ],
}

/** Where each Sentence of `text` starts and ends, as character offsets. */
export function sentenceSpans(
  text: string,
  language: string,
): { start: number; end: number }[] {
  const abbreviations = new Set([
    ...(ABBREVIATIONS[language] ?? []),
    ...(ABBREVIATIONS.en ?? []),
  ])
  const spans: { start: number; end: number }[] = []
  let start = 0
  // A stop, any closing quotes or brackets after it, then a space.
  const stop = /[.!?]+["'”’)\]]*(?=\s)/g
  for (let match = stop.exec(text); match; match = stop.exec(text)) {
    const end = match.index + match[0].length
    const before = /(\S+?)[.!?]+["'”’)\]]*$/.exec(text.slice(start, end))?.[1]
    const word = (before ?? "").toLowerCase().replace(/^[("'“‘[]+/, "")
    // An initial ("C. Caesar"), a listed abbreviation, or a number ("c. xiv.2") does not end a sentence.
    if (/^\p{Lu}$/u.test(before ?? "") || abbreviations.has(word)) continue
    if (/^\d/.test(text.slice(end).trimStart())) continue
    const span = trimmed(text, start, end)
    // ". . ." on its own is not a sentence: it joins the one after it.
    if (span && /\p{L}/u.test(text.slice(span.start, span.end))) {
      spans.push(span)
      start = end
    }
  }
  const last = trimmed(text, start, text.length)
  if (last && /\p{L}/u.test(text.slice(last.start, last.end))) spans.push(last)
  return spans
}

function trimmed(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } | undefined {
  while (start < end && /\s/.test(text[start] ?? "")) start++
  while (end > start && /\s/.test(text[end - 1] ?? "")) end--
  return end > start ? { start, end } : undefined
}

/** `9.2@3-7` → the Locator `9.2` and Sentences 3 to 7; no `@`, no Sentences. */
export function splitSentenceRef(written: string): {
  locator: string
  sentences?: { from: number; to: number }
} {
  const match = /^(.*?)@\s*(\d+)(?:\s*[–—-]\s*(\d+))?\s*$/.exec(written)
  if (!match?.[1] || !match[2]) return { locator: written }
  const from = Number(match[2])
  const to = Number(match[3] ?? match[2])
  return {
    locator: match[1],
    sentences: { from: Math.min(from, to), to: Math.max(from, to) },
  }
}
