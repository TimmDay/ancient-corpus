// Texts from The Latin Library (thelatinlibrary.com), one saved page in an
// intake zip. A chapter opens a <p> with <a name="N"></a><b>N</b>; its
// sections are <font size="-1"><sup>M</sup></font>. Passages are chapters: a
// section Locator such as `27.7` lands on its chapter. Section numbers are
// dropped from the text, as in the other Latin Editions.

import type { Element } from "domhandler"
import type { EditionSource, ImportedEdition, Passage } from "../corpus.ts"
import {
  escapeHtml,
  onlyArchive,
  plainText,
  readIntakeHtml,
} from "./gutenberg.ts"

export function importLatinLibrary(source: EditionSource): ImportedEdition {
  const $ = readIntakeHtml(onlyArchive(source))
  const passages: Omit<Passage, "flags">[] = []
  let current: Omit<Passage, "flags"> | undefined
  for (const p of $("p").toArray() as Element[]) {
    const anchor = $(p).children("a[name]").first().attr("name")
    if (anchor && /^\d+$/.test(anchor)) {
      current = {
        locator: anchor,
        headings: [],
        division: "",
        blocks: [],
        notes: [],
        text: "",
      }
      passages.push(current)
    } else if (/border/.test($(p).attr("class") ?? "")) {
      // The rule before the site's footer ends the text.
      current = undefined
    }
    if (!current) continue
    $(p).find("a[name], b, sup, font").remove()
    const text = $(p)
      .text()
      .replace(/\s+/g, " ")
      .trim()
      // A paragraph inside a chapter opens with a broken tag, "17</sup></font>",
      // which leaves its section number as text.
      .replace(/^\d+ /, "")
    if (text) current.blocks.push(escapeHtml(text))
  }
  for (const passage of passages)
    passage.text = plainText(passage.blocks.join(" "))
  return { divisions: [], passages, editorial: [] }
}
