// Cassius Dio, Roman History, tr. Herbert Baldwin Foster (1905–1906), Project
// Gutenberg, six volumes transcribed by different hands.
//
// Volumes 2, 3, 4 and 6 share one shape: a "DIO'S ROMAN HISTORY" heading opens
// Foster's argument and consul list for the next book; a "(BOOK N, BOISSEVAIN)"
// heading starts the book's text; chapters are marked inside paragraphs as
// "[-N-]" or "[Sidenote:—N—]", years as "[B.C. 69 (a.u. 685)]" or
// "[Sidenote: A.D. 211 …]"; footnotes are "[N]" in the text and "[Footnote N: …]"
// after a FOOTNOTES heading. Foster marks chapters only, so a Locator such as
// 36.4.2 lands on 36.4. Book numbers are Boissevain's, which Foster prints in
// his headings; for books 77–80 they run one ahead of the older numbering.

import type { CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import type {
  Division,
  EditionSource,
  Heading,
  ImportedEdition,
  IntakeArchive,
  Passage,
} from "../corpus.ts"
import {
  inlineHtml,
  noteRefHtml,
  plainText,
  readIntakeHtml,
} from "./gutenberg.ts"

type Draft = Omit<Passage, "flags">

// Spelled BOISSEVAIN, BOSSEVAIN and BOISSAVAIN across the volumes.
const BOOK_START = /\(\s*BOOK\s+(\d+)\s*,\s*BO[A-Z]*N\b/i
const CHAPTER_MARKER =
  /\[\s*-\s*\d+\s*-?\s*\]|\[\s*\d+\s*-\s*\]|\[Sidenote:\s*[—–-]+\s*\d+/
const SUMMARY_START = /DIO'?S ROMAN HISTORY/i
/**
 * Books whose chapter numbers start again part way through, and the name that
 * tells the second run apart: Boissevain's Book 80 restarts at 1 for Alexander's
 * reign, so its Locators are `80.1(Alexander)` and the like.
 */
const RESTARTED_BOOKS: Record<string, string> = { "80": "Alexander" }
/**
 * Chapters Foster gives twice, once from the epitome and excerpts out of
 * sequence, and which printing (1st or 2nd) is that version: it becomes
 * `60.32(epitome)`, leaving `60.32` for the main text.
 */
const EPITOME_REPEATS: Record<string, 1 | 2> = {
  "60.32": 2, // bracketed, after the main 60.32–33
  "60.33": 2,
  "78.19": 1, // printed before the main 78.19–20; 78.20 is bracketed
  "78.20": 1,
  "80.11": 1, // printed between 80.8 and 80.9
  "80.12": 1,
}
// One pattern for every marker, so they are handled in the order they appear.
// A chapter Boissevain added between two others is lettered: "[-10a-(<i>Boissevain</i>)]".
const MARKER =
  /\[\s*-\s*(\d+[a-z]?)\s*-?\s*(?:\(\s*(?:<i>)?Boissevain(?:<\/i>)?\s*\))?\s*\]|\[\s*(\d+)\s*-\s*\]|\[Sidenote:\s*[—–-]+\s*(\d+)\s*[—–-]+\s*\]|\[(?:Sidenote:\s*)?((?:B\.\s?C\.|A\.\s?D\.)[^\]]*)\]|\[(\d+)\]/g

export function importDio(source: EditionSource): ImportedEdition {
  const divisions: Division[] = []
  const passages: Draft[] = []
  let nextNoteId = 1

  for (const archive of source.archives) {
    const volume = readVolume(archive, nextNoteId)
    nextNoteId += volume.notes.size
    divisions.push(...volume.divisions)
    passages.push(...volume.passages)
  }
  const printings = new Map<string, number>()
  for (const passage of passages) {
    const printing = (printings.get(passage.locator) ?? 0) + 1
    printings.set(passage.locator, printing)
    if (EPITOME_REPEATS[passage.locator] === printing)
      passage.locator = `${passage.locator}(epitome)`
  }
  return { divisions, passages, editorial: [] }
}

function readVolume(archive: IntakeArchive, firstNoteId: number) {
  const $ = readIntakeHtml(archive)
  const notes = readFootnotes($, firstNoteId)
  const divisions: Division[] = []
  const passages: Draft[] = []

  let book: Division | undefined
  /** Set while reading the second run of a restarted book, e.g. "Alexander". */
  let qualifier: string | undefined
  let summary: string[] = []
  /** The bare book number under "DIO'S ROMAN HISTORY", for books with no BOISSEVAIN heading (58). */
  let summaryBook: string | undefined
  const state: { mode: "front" | "summary" | "text" | "done" } = {
    mode: "front",
  }
  let pendingHeadings: Heading[] = []
  let current: Draft | undefined
  let startedParagraph = false

  const elements = $("body").find("h1, h2, h3, h4, h5, h6, p").toArray()
  for (const el of elements) {
    if (state.mode === "done") break
    const $el = $(el)
    const text = $el.text().replace(/\s+/g, " ").trim()
    const isHeading = /^h\d$/.test(el.name)

    // Volume 6 ends with fragments of books before 36, which need their own numbering; not imported yet.
    if (
      (isHeading && /^FOOTNOTES/i.test(text)) ||
      /^PRESERVED FROM BOOKS/i.test(text)
    ) {
      state.mode = "done"
      continue
    }
    if ($el.closest("#pg-header, #pg-footer, .pg-boilerplate").length) continue

    if (SUMMARY_START.test(text) && (isHeading || text.length < 30)) {
      state.mode = "summary"
      summary = []
      summaryBook = undefined
      continue
    }
    const bookStart = BOOK_START.exec(text)
    if (bookStart?.[1] && text.length < 40) {
      startBook(bookStart[1])
      continue
    }
    if (
      state.mode === "summary" &&
      summaryBook &&
      !isHeading &&
      CHAPTER_MARKER.test(text)
    ) {
      startBook(summaryBook)
    }

    if (state.mode === "summary") {
      if (/^\d+$/.test(text)) {
        summaryBook = text
        continue
      }
      summary.push(
        isHeading
          ? `<h4>${inlineHtml($, $el.contents())}</h4>`
          : `<p>${inlineHtml($, $el.contents())}</p>`,
      )
      continue
    }
    if (state.mode !== "text" || !book || isHeading) continue

    // Walk the paragraph's markers in order, cutting it into Passages.
    const html = inlineHtml($, $el.contents()).trim()
    startedParagraph = true
    let cursor = 0
    for (const match of html.matchAll(MARKER)) {
      const before = html.slice(cursor, match.index).trim()
      if (before) append(before)
      cursor = (match.index ?? 0) + match[0].length
      const [, chapter, slipChapter, sidenoteChapter, year, noteNumber] = match
      const chapterNumber = chapter ?? slipChapter ?? sidenoteChapter
      if (chapterNumber) {
        current = {
          locator: qualifier
            ? `${book.locator.replace(/\(.*/, "")}.${chapterLocator(chapterNumber)}(${qualifier})`
            : `${book.locator}.${chapterLocator(chapterNumber)}`,
          headings: pendingHeadings,
          division: book.locator,
          blocks: [],
          notes: [],
          text: "",
        }
        passages.push(current)
        pendingHeadings = []
        startedParagraph = true
      } else if (year) {
        pendingHeadings.push({
          kind: "section",
          html: year.replace(/\s+/g, " ").trim(),
          editorial: true,
        })
      } else if (noteNumber) {
        const id = notes.ids.get(noteNumber)
        if (id) append(noteRefHtml(id), true)
      }
    }
    const rest = html.slice(cursor).trim()
    if (rest) append(rest)
  }

  for (const passage of passages) {
    const joined = passage.blocks.join(" ")
    passage.notes = [...joined.matchAll(/id="r-([^"]+)"/g)].flatMap(
      ([, id = ""]) => {
        const note = notes.byId.get(id)
        return note === undefined ? [] : [{ id, html: note }]
      },
    )
    passage.text = plainText(joined)
  }
  return { divisions, passages, notes: notes.ids }

  function startBook(heading: string): void {
    // A heading that repeats the last book is a slip ("BOOK 57" over Book 58's text); the summary's number wins.
    const number =
      heading === divisions.at(-1)?.locator && summaryBook
        ? summaryBook
        : heading
    // Volumes are read one at a time, so a restart is always within this one.
    qualifier = divisions.some((d) => d.locator === number)
      ? RESTARTED_BOOKS[number]
      : undefined
    book = qualifier
      ? {
          locator: `${number}(${qualifier})`,
          label: `Book ${number} (${qualifier})`,
        }
      : { locator: number, label: `Book ${number}` }
    if (summary.length) book.summary = summary.join("")
    divisions.push(book)
    state.mode = "text"
    current = undefined
    pendingHeadings = [{ kind: "division", html: book.label, editorial: false }]
    summary = []
  }

  /** Adds HTML to the current Passage: a new block at a paragraph start, otherwise onto the last block. */
  function append(fragment: string, glued = false): void {
    if (!current) {
      // Text before chapter 1 (a lost beginning, an epitomator's summary) is Foster's framing.
      if (book && !glued)
        book.summary = `${book.summary ?? ""}<p>${fragment}</p>`
      return
    }
    if (startedParagraph || !current.blocks.length) {
      current.blocks.push(fragment)
      startedParagraph = false
    } else {
      const last = current.blocks.length - 1
      current.blocks[last] = glued
        ? `${current.blocks[last]}${fragment}`
        : `${current.blocks[last]} ${fragment}`
    }
  }
}

/** "07" → "7", "10a" → "10a". */
function chapterLocator(marker: string): string {
  return marker.replace(/^0+(?=\d)/, "")
}

/** "[Footnote 3: …]" paragraphs, numbered per volume; given ids unique across the Edition. */
function readFootnotes($: CheerioAPI, firstId: number) {
  const ids = new Map<string, string>()
  const byId = new Map<string, string>()
  let next = firstId
  for (const p of $("p").toArray() as Element[]) {
    const html = inlineHtml($, $(p).contents()).trim()
    const match = /^\[Footnote\s+(\d+):\s*([\s\S]*?)\]?$/.exec(html)
    if (!match?.[1] || ids.has(match[1])) continue
    const id = String(next++)
    ids.set(match[1], id)
    byId.set(id, (match[2] ?? "").trim())
  }
  return { ids, byId, size: ids.size }
}
