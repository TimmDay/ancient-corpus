// Texts from The Latin Library (thelatinlibrary.com), one saved page in an
// intake zip. A chapter opens a <p> with <a name="N"></a><b>N</b>, or with
// "[N]" (Lactantius); its sections are <font size="-1"><sup>M</sup></font>, or
// <span style="font-size: 80%;">M</span>. Passages are chapters: a
// section Locator such as `27.7` lands on its chapter. Section numbers are
// dropped from the text, as in the other Latin Editions. Bold is a chapter
// number, or (Orosius) the names of places, which are kept.
//
// A Work in several books (Orosius) is one saved page per book, one archive
// each in reading order: Locators are `book.chapter`, and text before a
// book's first chapter is its preface, `1.praef`, whether the site labels it
// "[Prologus]", "[Praef.]" or not at all.

import type { Element } from "domhandler"
import type {
  Division,
  EditionSource,
  ImportedEdition,
  IntakeArchive,
  Passage,
} from "../corpus.ts"
import { escapeHtml, plainText, readIntakeHtml } from "./gutenberg.ts"

export function importLatinLibrary(source: EditionSource): ImportedEdition {
  if (source.archives.length === 1 && source.archives[0])
    return {
      divisions: [],
      passages: chapters(source.archives[0], ""),
      editorial: [],
    }
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  source.archives.forEach((archive, i) => {
    const book = String(i + 1)
    const label = `Book ${book}`
    divisions.push({ locator: book, label })
    const inBook = chapters(archive, book)
    inBook[0]?.headings.push({
      kind: "division",
      html: label,
      editorial: false,
    })
    passages.push(...inBook)
  })
  return { divisions, passages, editorial: [] }
}

/** One page's chapters; in a book of a longer Work, with its preface first. */
function chapters(
  archive: IntakeArchive,
  book: string,
): Omit<Passage, "flags">[] {
  const $ = readIntakeHtml(archive)
  const passages: Omit<Passage, "flags">[] = []
  let current: Omit<Passage, "flags"> | undefined
  const start = (n: string) => {
    current = {
      locator: book ? `${book}.${n}` : n,
      headings: [],
      division: book,
      blocks: [],
      notes: [],
      text: "",
    }
    passages.push(current)
  }
  for (const p of $("p").toArray() as Element[]) {
    const anchor =
      $(p).children("a[name]").first().attr("name") ??
      /^\s*\[(\d+)\]/.exec($(p).text())?.[1]
    if (anchor && /^\d+$/.test(anchor)) {
      start(anchor)
    } else if (/border/.test($(p).attr("class") ?? "")) {
      // The rule before the site's footer ends the text.
      current = undefined
    } else if (book && !passages.length && !$(p).attr("class")) {
      start("praef")
    }
    if (!current) continue
    $(p).find("a[name], sup, font, span[style*='font-size']").remove()
    $(p)
      .find("b")
      .filter((_, b) => /^\s*\d+\s*$/.test($(b).text()))
      .remove()
    const text = $(p)
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\[(?:\d+|Prologus|Praef\.)\] /, "")
      // A paragraph inside a chapter opens with a broken tag, "17</sup></font>",
      // which leaves its section number as text.
      .replace(/^\d+ /, "")
    if (text) current.blocks.push(escapeHtml(text))
  }
  for (const passage of passages)
    passage.text = plainText(passage.blocks.join(" "))
  return passages.filter((p) => p.blocks.length)
}
