// Cassius Dio, Roman History, tr. Herbert Baldwin Foster (1905–1906), Project
// Gutenberg, six volumes transcribed by different hands.
//
// Volumes 2, 3, 4 and 6 share one shape: a "DIO'S ROMAN HISTORY" heading opens
// Foster's argument and consul list for the next book; a "(BOOK N, BOISSEVAIN)"
// heading starts the book's text; chapters are marked inside paragraphs as
// "[-N-]" or "[Sidenote:—N—]", years as "[B.C. 69 (a.u. 685)]" or
// "[Sidenote: A.D. 211 …]"; footnotes are "[N]" in the text and "[Footnote N: …]"
// after a FOOTNOTES heading. Foster marks chapters only, so a Locator such as
// 36.4.2 lands on 36.4.

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
// One pattern for every marker, so they are handled in the order they appear.
const MARKER =
  /\[\s*-\s*(\d+)\s*-?\s*\]|\[\s*(\d+)\s*-\s*\]|\[Sidenote:\s*[—–-]+\s*(\d+)\s*[—–-]+\s*\]|\[(?:Sidenote:\s*)?((?:B\.\s?C\.|A\.\s?D\.)[^\]]*)\]|\[(\d+)\]/g

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
  divisions.sort((a, b) => Number(a.locator) - Number(b.locator))
  passages.sort((a, b) => compareLocators(a.locator, b.locator))
  return { divisions, passages, editorial: [] }
}

function readVolume(archive: IntakeArchive, firstNoteId: number) {
  const $ = readIntakeHtml(archive)
  const notes = readFootnotes($, firstNoteId)
  const divisions: Division[] = []
  const passages: Draft[] = []

  let book: Division | undefined
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
          locator: `${book.locator}.${Number(chapterNumber)}`,
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
    book = { locator: number, label: `Book ${number}` }
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

function compareLocators(a: string, b: string): number {
  const [ab = 0, ac = 0] = a.split(".").map(Number)
  const [bb = 0, bc = 0] = b.split(".").map(Number)
  return ab - bb || ac - bc
}
