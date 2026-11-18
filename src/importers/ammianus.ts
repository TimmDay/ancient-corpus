// Ammianus Marcellinus, Res Gestae, tr. C. D. Yonge (Bohn, 1862), Project
// Gutenberg #28587.
//
// Books 14 to 31, the ones that survive. Each book is an <h3> "BOOK XIV.",
// then Yonge's Argument (Editorial matter), then chapters: a p.subchap "I."
// and often a dating line "A.D. 353". Each paragraph opens with its section
// number ("§ 1." for a chapter's first, then "2."), so a Passage is a section,
// 14.1.2. A paragraph without a number carries on the section before it
// (verse set off, a letter quoted). Yonge's footnotes become notes.
// A chapter numeral that repeats the one before is read as the next.

import type { Element } from "domhandler"
import type {
  Division,
  EditionSource,
  EditorialSection,
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

export function importAmmianus(source: EditionSource): ImportedEdition {
  const $ = readIntakeHtml(onlyArchive(source))
  const footnotes = readFootnotes($)
  const options = {
    drop: (el: Element) =>
      /\bpagenum\b/.test(el.attribs.class ?? "") ||
      (el.name === "div" && /footnotes?/.test(el.attribs.class ?? "")),
    noteRef: (el: Element) => footnoteId(el),
  }
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  const editorial: EditorialSection[] = []
  let book = ""
  let chapter = ""
  let headings: Heading[] = []
  let current: Omit<Passage, "flags"> | undefined

  for (const el of $("h3, p").toArray()) {
    const $el = $(el)
    if ($el.closest(".footnote, .footnotes").length) continue
    const text = $el.text().replace(/\s+/g, " ").trim()
    if (el.name === "h3") {
      const numeral = /^BOOK ([IVXL]+)\.$/.exec(text)?.[1]
      if (text === "INDEX.") break
      if (!numeral) continue
      book = String(romanToInt(numeral))
      chapter = ""
      divisions.push({ locator: book, label: `Book ${book}` })
      headings = [{ kind: "division", html: `Book ${book}`, editorial: false }]
      current = undefined
      continue
    }
    if (!book) continue
    if ($el.closest(".blockquot").length && $el.hasClass("hang")) {
      editorial.push({
        id: `ed-${editorial.length + 1}`,
        title: `Argument of Book ${book}`,
        html: `<p>${inlineHtml($, $el.contents(), options).trim()}</p>`,
        notes: notesFor(inlineHtml($, $el.contents(), options), footnotes),
      })
      continue
    }
    if (text === "ARGUMENT.") continue
    if ($el.hasClass("subchap")) {
      const numeral = /^([IVXL]+)\.?$/.exec(text)?.[1]
      if (numeral) {
        const n = romanToInt(numeral)
        // Gutenberg prints Book 22's "XIII." as a second "XII.".
        chapter = String(n <= Number(chapter) ? Number(chapter) + 1 : n)
        headings.push({
          kind: "section",
          html: `Chapter ${chapter}`,
          editorial: false,
        })
      }
      continue
    }
    // Yonge's dating line under a chapter number: "A.D. 353."
    if ($el.hasClass("center") && /^A\.D\./.test(text)) {
      headings.push({ kind: "subtitle", html: text, editorial: true })
      continue
    }
    const html = inlineHtml($, $el.contents(), options).trim()
    if (!plainText(html)) continue
    const number = /^(?:§\s*)?(\d+)\.\s+/.exec(plainText(html))?.[1]
    if (number && chapter) {
      current = {
        locator: `${book}.${chapter}.${number}`,
        headings,
        division: book,
        blocks: [html.replace(/^(?:§\s*)?\d+\.\s+/, "")],
        notes: [],
        text: "",
      }
      headings = []
      passages.push(current)
      continue
    }
    if (current) current.blocks.push(html)
  }
  for (const p of passages) {
    const html = p.blocks.join(" ")
    p.text = plainText(html)
    p.notes = notesFor(html, footnotes)
  }
  return { divisions, passages, editorial }
}
