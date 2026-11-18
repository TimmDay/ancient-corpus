// Julian, The Caesars, ed. and tr. Wilmer Cave Wright, The Works of the
// Emperor Julian vol. 2 (Loeb, 1913), Project Gutenberg #48768.
//
// The Loeb prints the Greek and Wright's English on facing pages; the
// transcription gives each Greek paragraph and then its English in
// parentheses, and quoted verse as a div.tei-quote holding both. Spanheim's
// pages and sections are printed in the Greek only, as "[307]" and "[B]"; the
// first, 306a, is not printed. The English is not divided by section, so a
// Passage is one or more of Wright's paragraphs, named by the section the
// first one starts in (`313d`). A paragraph that starts in the same section
// as the one before, or carries on a sentence broken by a quotation, joins
// the Passage before it; sections that begin inside a Passage are left to it.
// The Greek Edition takes the Greek, the English one the English, with the
// same Locators. Notes are numbered through the whole volume; Wright's
// introduction is Editorial matter of the English.

import type { CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import type {
  Edition,
  EditionSource,
  EditorialSection,
  Heading,
  ImportedEdition,
  Passage,
  Work,
} from "../corpus.ts"
import {
  blockHtml,
  inlineHtml,
  notesFor,
  onlyArchive,
  plainText,
  readIntakeHtml,
} from "./gutenberg.ts"

const SECTION_MARK = /\[(\d{3}|[A-D])\]\s*/g

type Side = "grc" | "en"

export function importJulianCaesars(
  source: EditionSource,
  _work: Work,
  edition: Edition,
): ImportedEdition {
  const $ = readIntakeHtml(onlyArchive(source))
  const language = edition.language as Side
  styleInline($)
  const notes = readNotes($)
  const options = {
    noteRef: (el: Element) => {
      const href = el.attribs.href ?? ""
      return el.name === "a" && href.startsWith("#note_")
        ? href.replace("#note_", "")
        : undefined
    },
    drop: (el: Element) => /\btei-pb\b/.test(el.attribs.class ?? ""),
  }

  const title = $("h1")
    .filter((_, h1) => $(h1).text().trim() === "The Caesars")
    .first()
  if (!title.length) throw new Error("No heading for The Caesars")
  const [intro, text] = title.parent().children("div").toArray()
  if (!intro || !text) throw new Error("The Caesars: no introduction or text")

  const passages: Omit<Passage, "flags">[] = []
  const titleLines: Record<Side, string[]> = { grc: [], en: [] }
  let section = { page: 306, letter: "a" }
  const locator = () => `${section.page}${section.letter}`
  // Moves the running section past each marker, and drops the markers.
  const pass = (html: string) =>
    html.replace(SECTION_MARK, (_, mark: string) => {
      section = /\d/.test(mark)
        ? { page: Number(mark), letter: "a" }
        : { page: section.page, letter: mark.toLowerCase() }
      return ""
    })
  const add = (side: Side, html: string) => {
    const current = passages.at(-1)
    if (!current) throw new Error(`Text before the first Passage: ${html}`)
    if (side === language) current.blocks.push(html.trim())
  }

  for (const el of $(text).children().toArray()) {
    const $el = $(el)
    if ($el.is("p")) {
      const html = inlineHtml($, $el.contents(), options).trim()
      const side = sideOf(html)
      if (passages.length === 0 && titleLines.en.length < 2) {
        titleLines[side].push(unwrap(html))
        continue
      }
      if (side === "en") {
        add("en", unwrap(html))
        continue
      }
      const leading = html.match(/^\[(\d{3}|[A-D])\]/)
      if (leading) pass(leading[0])
      const start = locator()
      const body = pass(html).trim()
      const opens = /^\p{Lu}/u.test(plainText(body))
      if (!passages.length || (opens && passages.at(-1)?.locator !== start)) {
        passages.push({
          locator: start,
          headings: passages.length ? [] : titleHeadings(titleLines[language]),
          division: "",
          blocks: [],
          notes: [],
          text: "",
        })
      }
      add("grc", body)
    } else if ($el.is("div.tei-quote")) {
      for (const part of $el.children().toArray()) {
        const lines = $(part).is("div.tei-lg")
          ? $(part)
              .children("div.tei-l")
              .toArray()
              .map((l) => inlineHtml($, $(l).contents(), options).trim())
          : [inlineHtml($, $(part).contents(), options).trim()]
        const side = sideOf(lines.join(" "))
        const html = lines.join(" <br>")
        add(side, side === "grc" ? pass(html) : unwrap(html))
      }
    }
  }

  for (const passage of passages) {
    passage.notes = notesFor(passage.blocks.join(" "), notes)
    passage.text = plainText(passage.blocks.join(" "))
  }
  const editorial: EditorialSection[] = []
  if (language === "en") {
    const html = blockHtml($, $(intro).children("p"), options)
    editorial.push({
      id: "ed-1",
      title: "Introduction",
      html,
      notes: notesFor(html, notes),
    })
  }
  return { divisions: [], passages, editorial }
}

/** "grc" when a block is mostly Greek letters, else "en". */
function sideOf(html: string): Side {
  const text = plainText(html)
  const greek = (text.match(/[Ͱ-Ͽἀ-῿]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return greek > latin ? "grc" : "en"
}

/** The transcriber's parentheses around each English paragraph. */
function unwrap(html: string): string {
  return html
    .trim()
    .replace(/^\(\s*/, "")
    .replace(/\s*\)((?:<sup class="nref">.*?<\/sup>)?)$/, "$1")
    .replace(/\s*\)$/, "")
}

/** Wright's title, two lines in each language: author, then work. */
function titleHeadings(lines: string[]): Heading[] {
  const [author, work] = lines
  if (!author || !work) throw new Error(`The Caesars: title is ${lines}`)
  return [
    { kind: "section", html: author, editorial: false },
    { kind: "subtitle", html: work, editorial: false },
  ]
}

/** This transcription marks italics and small capitals with inline styles. */
function styleInline($: CheerioAPI): void {
  $('span[style*="font-style: italic"]').each((_, el) => {
    el.name = "i"
  })
  $('span[style*="small-caps"]').each((_, el) => {
    el.attribs.class = "smcap"
  })
}

/** The volume's notes, `dt` label then `dd` text, by number. */
function readNotes($: CheerioAPI): Map<string, string> {
  const notes = new Map<string, string>()
  for (const dt of $("dt.tei-notelabel").toArray()) {
    const id = $(dt).find("a[id^=note_]").attr("id")?.replace("note_", "")
    const dd = $(dt).next("dd.tei-notetext")
    if (id && dd.length) notes.set(id, inlineHtml($, dd.contents()).trim())
  }
  return notes
}
