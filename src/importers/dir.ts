// Translations from De Imperatoribus Romanis (roman-emperors.org), one static
// page of the Canisius College Translated Texts saved into an intake zip:
// Banchich and Meka's Festus (2001). The page runs Introduction, Notes, the
// translation and an Index of names, each after a centred bold heading. Each
// chapter is one <p> opening with its Roman numeral, "XXIV. ", and running its
// sections together as "2. … 3. …"; Wagener's page numbers print in bold
// brackets, "[15]", and are kept, before a section number that follows one. Links to the site's emperor pages
// are dropped, keeping their words. The rest of the page is Editorial matter,
// kept whole as the copyright notice asks.

import type { CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import type {
  EditionSource,
  EditorialSection,
  ImportedEdition,
  Passage,
} from "../corpus.ts"
import {
  blockHtml,
  inlineHtml,
  onlyArchive,
  plainText,
  readIntakeHtml,
  romanToInt,
} from "./gutenberg.ts"
import { sections } from "./topostext.ts"

const PARTS: Record<string, string> = {
  INTRODUCTION: "Introduction",
  NOTES: "Notes",
  // The translation's title, printed over three lines.
  BREVIARIUM: "text",
  OF: "text",
  "THE ACCOMPLISHMENTS OF THE ROMAN PEOPLE": "text",
  "INDEX OF NAMES OF INDIVIDUALS": "Index of Names of Individuals",
}

export function importDir(source: EditionSource): ImportedEdition {
  const $ = readIntakeHtml(onlyArchive(source))
  // A bold link is the site's link to an emperor's page, not the translators' emphasis.
  $("b:has(a)").each((_, b) => {
    $(b).replaceWith($(b).contents())
  })
  const passages: Omit<Passage, "flags">[] = []
  const editorial: EditorialSection[] = []
  let part: string | undefined

  for (const p of $("p").toArray()) {
    const text = $(p).text().replace(/\s+/g, " ").trim()
    const heading = PARTS[text]
    if (heading && $(p).find("b").length) {
      if (heading === part) continue
      part = heading
      if (part !== "text")
        editorial.push({
          id: `editorial-${editorial.length + 1}`,
          title: part,
          html: "",
          notes: [],
        })
      continue
    }
    // The site's link home, after the translators' own last lines.
    if (!part || !text || text === "Return to the Imperial Index") continue
    if (part === "text") {
      const passage = chapter($, p)
      if (passage) passages.push(passage)
      continue
    }
    const section = editorial.at(-1)
    if (section)
      section.html += blockHtml($, $(p)).replace(
        /(?:\s*<br>)+\s*<\/p>/g,
        "</p>",
      )
  }
  return { divisions: [], passages, editorial }
}

/** A chapter, its sections a paragraph each, numbered as printed. */
function chapter(
  $: CheerioAPI,
  p: Element,
): Omit<Passage, "flags"> | undefined {
  const html = inlineHtml($, $(p).contents()).trim()
  // A page of Wagener's that starts with the chapter prints its number first.
  const [, page = "", roman = "", rest = ""] =
    /^(<b>\[\d+\]<\/b>\s*)?([IVXL]+)\.\s+(.*)$/s.exec(html) ?? []
  if (!roman) return undefined
  const locator = String(romanToInt(roman))
  // A section that opens a page prints after the page number, "[3] 2. "; the
  // number goes first, so the section starts at the page.
  const text = (page.trim() + " " + rest)
    .trim()
    .replace(/(<b>\[\d+\]<\/b>)\s*(\d+\.)\s/g, "$2 $1 ")
  const blocks = sections(text, 1).map(({ section, html }) =>
    section === 1 ? html : `${section}. ${html}`,
  )
  return {
    locator,
    headings: [],
    division: "",
    blocks,
    notes: [],
    text: plainText(blocks.join(" ")),
  }
}
