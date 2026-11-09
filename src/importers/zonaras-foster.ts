// Zonaras, Epitome Historiarum 7–9, tr. Herbert Baldwin Foster, in Dio's Rome,
// vol. 1 (1905), Project Gutenberg #18047. Foster prints Zonaras's books 7–9 as
// the epitome of Dio's lost books 1–21, under "(BOOK N, BOISSEVAIN.)" headings
// that name Dio's book; a Zonaras chapter is marked "VII, 6.—".
// Small capitals mark words a surviving fragment of Dio shares with Zonaras,
// and a "Frag. N" sidenote names the fragment. Foster leaves some chapters out
// (7.2–5, 7.12, 7.21–23) and runs 9.13 into 9.12. The fragments of Dio's books
// 22–35 that follow are Dio's, not Zonaras's, and are not imported.

import type { CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import type {
  Division,
  EditionSource,
  Heading,
  ImportedEdition,
  Passage,
} from "../corpus.ts"
import {
  footnoteId,
  inlineHtml,
  notesFor,
  onlyArchive,
  plainText,
  readFootnotes,
  readIntakeHtml,
  romanToInt,
} from "./gutenberg.ts"

const DIO_BOOK = /^\(BOOK (\d+), BOISSEVAIN\.?\)\.?$/
const CHAPTER = /\b(VII|VIII|IX), (\d+)\.—\s*/
const YEAR = /^(?:B\.\s?C\.|A\.\s?D\.)/

export function importZonarasFoster(source: EditionSource): ImportedEdition {
  return readZonarasFoster(readIntakeHtml(onlyArchive(source)))
}

export function readZonarasFoster($: CheerioAPI): ImportedEdition {
  // Gutenberg's ids repeat the number ("12_12"); the printed number is enough.
  const short = (id: string) => id.replace(/_\d+$/, "")
  const footnotes = new Map(
    [...readFootnotes($)].map(([id, html]) => [short(id), html]),
  )
  const options = {
    noteRef: (el: Element) => {
      const id = footnoteId(el)
      return id === undefined ? undefined : short(id)
    },
    drop: (el: Element) =>
      /\b(pagenum|sidenote)\b/.test(el.attribs.class ?? ""),
  }
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  let pending: Heading[] = []
  let reading = false

  for (const el of $("body").find("h3, p, hr").toArray()) {
    const $el = $(el)
    const text = $el.text().replace(/\s+/g, " ").trim()
    const dioBook = DIO_BOOK.exec(text)?.[1]
    // The rule after 9.31 ends Zonaras; Foster's note on the fragments follows.
    if (el.name === "hr" && passages.at(-1)?.locator === "9.31") break
    if (el.name === "hr") continue
    if (el.name === "h3") {
      if (dioBook === "22") break
      if (dioBook) {
        reading = true
        pending.push({
          kind: "section",
          html: `Dio, Book ${dioBook} (Boissevain)`,
          editorial: true,
        })
      }
      continue
    }
    if (!reading || $el.closest("div.footnote").length) continue

    const html = inlineHtml($, $el.contents(), options).trim()
    // A chapter usually opens its paragraph, but once (8.4) starts inside one.
    const pieces = html.split(CHAPTER)
    const [lead = "", ...rest] = pieces
    if (lead.trim()) {
      const current = passages.at(-1)
      if (!current)
        throw new Error(`Text before the first chapter: ${text.slice(0, 60)}`)
      current.blocks.push(lead.trim())
    }
    for (let i = 0; i < rest.length; i += 3) {
      const book = String(romanToInt(rest[i] ?? ""))
      if (divisions.at(-1)?.locator !== book) {
        divisions.push({ locator: book, label: `Book ${book}` })
        pending.unshift({
          kind: "division",
          html: `Book ${book}`,
          editorial: false,
        })
      }
      // A year in the sidenote beside an opening chapter number dates the chapter.
      const year =
        i === 0 && !lead.trim()
          ? $el
              .children("span.sidenote")
              .toArray()
              .map((s) => inlineHtml($, $(s).contents()))
              .map((s) =>
                s
                  .replace(/<span class="sc">Frag\.[\s\S]*$/, "")
                  .replace(/\(\s+/g, "(")
                  .trim(),
              )
              .find((s) => YEAR.test(s))
          : undefined
      if (year) pending.push({ kind: "section", html: year, editorial: true })
      passages.push({
        locator: `${book}.${rest[i + 1] ?? ""}`,
        headings: pending,
        division: book,
        blocks: [(rest[i + 2] ?? "").trim()],
        notes: [],
        text: "",
      })
      pending = []
    }
  }

  for (const passage of passages) {
    passage.notes = notesFor(passage.blocks.join(" "), footnotes)
    passage.text = plainText(passage.blocks.join(" "))
  }
  return { divisions, passages, editorial: [] }
}
