// Texts from ToposText, one page per Work saved into an intake zip: each
// paragraph is `<p id='urn:cts:…:27'>`, opening with `<b>§ 27</b>` and running
// a chapter's sections together as "2. … 3. …". A long chapter is broken over
// several paragraphs, the later ones opening mid-chapter (`§ 1.10`). Links to
// ToposText's places and people are dropped, keeping their words.
//
// Banchich's Epitome de Caesaribus (2009) keeps the Teubner page numbers in
// brackets, "[159]", and its sigla, * and †, as printed; ToposText shows his
// "< >" around editorial additions as braces, "{himself}". Six section numbers
// are missing from his text; split Corrections, placed by the Teubner Latin,
// start those sections.

import type { CheerioAPI } from "cheerio"
import type {
  Division,
  EditionSource,
  EditorialSection,
  ImportedEdition,
  Passage,
} from "../corpus.ts"
import {
  inlineHtml,
  noteRefHtml,
  onlyArchive,
  plainText,
  readIntakeHtml,
} from "./gutenberg.ts"

export function importToposText(source: EditionSource): ImportedEdition {
  const $ = readIntakeHtml(onlyArchive(source))
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  const editorial: EditorialSection[] = []

  for (const p of $("p[id^='urn:cts:']").toArray()) {
    const at = (p.attribs.id ?? "").split(":").at(-1) ?? ""
    $(p).children("b").first().remove()
    if (at === "i") {
      editorial.push(preface($, p))
      continue
    }
    const [chapter = "", first = "1"] = at.split(".")
    const html = inlineHtml($, $(p).contents()).replace(/^\s+/, "").trim()
    if (!divisions.some((d) => d.locator === chapter))
      divisions.push({ locator: chapter, label: `Chapter ${chapter}` })
    sections(html, Number(first)).forEach(({ section, html }, i) => {
      passages.push({
        locator: `${chapter}.${section}`,
        headings:
          i === 0 && first === "1"
            ? [
                {
                  kind: "division",
                  html: `Chapter ${chapter}`,
                  editorial: true,
                },
              ]
            : [],
        division: chapter,
        blocks: [html],
        notes: [],
        text: plainText(html),
      })
    })
  }
  return { divisions, passages, editorial }
}

/**
 * A chapter's run of sections, split at each number in turn: section `n + 1`
 * starts at the first "n+1. " after a stop, so a number inside a sentence
 * ("in his fiftieth year") or out of sequence never splits it.
 */
export function sections(
  html: string,
  first: number,
): { section: number; html: string }[] {
  const found: { section: number; html: string }[] = []
  let section = first
  let rest = html
  const at = (n: number) =>
    new RegExp(`(?<=[.?!;:”’"')\\]*†]\\s)${n}\\.\\s`).exec(rest)
  for (;;) {
    // A number the source left out is stepped over, leaving a gap for a Correction.
    const next = at(section + 1) ? section + 1 : section + 2
    const match = at(next)
    if (!match) break
    found.push({ section, html: rest.slice(0, match.index).trim() })
    rest = rest.slice(match.index + match[0].length)
    section = next
  }
  found.push({ section, html: rest.trim() })
  return found
}

/** The translator's preface, with its notes ([[1]] in the text, then "NOTES: [[1]]…"). */
function preface(
  $: CheerioAPI,
  p: Parameters<CheerioAPI>[0],
): EditorialSection {
  const [body = "", notes = ""] = $(p)
    .html()!
    .replace(/^\s*(&nbsp;)*\s*/, "")
    .split(/\bNOTES:/)
  const paragraphs = (html: string) =>
    html
      .split(/<br\s*\/?>/)
      .map((part) =>
        inlineHtml($, $.load(part, null, false).root().contents()).trim(),
      )
      .filter(Boolean)
  const text = paragraphs(body)
    .map(
      (para) =>
        `<p>${para.replace(/\s*\[\[(\d+)\]\]/g, (_, n: string) => noteRefHtml(n))}</p>`,
    )
    .join("")
  return {
    id: "preface",
    title: "Translator's preface",
    html: text,
    notes: paragraphs(notes).map((note) => {
      const [, n = "", rest = ""] = /^\[\[(\d+)\]\]\s*(.*)$/.exec(note) ?? []
      return { id: n, html: rest }
    }),
  }
}
