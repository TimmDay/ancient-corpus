// Texts transcribed by Roger Pearse on tertullian.org, saved page by page into
// one intake zip: runs of <P> paragraphs, with print page numbers as
// <span class="pb">|6</span> and the translator's footnotes moved to the end.
//
// Zosimus, New History (London: Green and Chaplin, 1814): one page per book.
// It prints no chapter numbers, so each book arrives as one Passage at chapter
// 1; split Corrections, found by aligning the English with Mendelssohn's Greek
// chapters (scripts/align-chapters.ts) and checked by reading, start the others.
//
// Eutropius, Breviarium, tr. J. S. Watson (Bohn, 1886 reprint): one page for
// all ten books, each an <h3> "BOOK IX.", then Watson's contents in small
// print, then chapters opening "XIII. ", as in the Latin.
//
// Herodian, History of the Roman Empire, tr. E. C. Echols (1961): one page
// per book, each chapter opened by a paragraph "CHAPTER I." holding
// <span class="chapterno"><a name="C1">, its sections numbered in the text
// (<span class="verse"><a name="1_2">2.</span>), which are dropped. A
// Passage is a chapter; Echols' notes follow the text, each a paragraph
// opened by <a name="12"></a>12.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { load, type CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import { unzipSync } from "fflate"
import {
  INTAKE_DIR,
  type Division,
  type EditionSource,
  type EditorialSection,
  type Heading,
  type ImportedEdition,
  type Passage,
} from "../corpus.ts"
import { notesFor } from "./gutenberg.ts"
import { inlineHtml, onlyArchive, plainText, romanToInt } from "./gutenberg.ts"

const BOOKS: Record<string, string[]> = {
  "Historia Nova": [
    "zosimus01_book1",
    "zosimus02_book2",
    "zosimus03_book3",
    "zosimus04_book4",
    "zosimus05_book5",
    "zosimus06_book6",
  ],
}

/** Works with a page per book and anchored chapters, by page. */
const ANCHORED: Record<string, string[]> = {
  "History of the Empire from the Death of Marcus": [
    "herodian_01_book1",
    "herodian_02_book2",
    "herodian_03_book3",
    "herodian_04_book4",
    "herodian_05_book5",
    "herodian_06_book6",
    "herodian_07_book7",
    "herodian_08_book8",
  ],
}

/** Works on one page, numbered by book and chapter. */
const CHAPTERED: Record<string, string> = {
  "Breviarium historiae Romanae": "eutropius_breviarium_2_text",
}

const options = {
  drop: (el: Element) => /\bpb\b/.test(el.attribs.class ?? ""),
  // The translator's footnotes, moved to the end of the page: <a href="#1"><sup>1</sup></a>.
  noteRef: (el: Element) =>
    el.name === "a" && /^#\d+$/.test(el.attribs.href ?? "")
      ? (el.attribs.href ?? "").slice(1)
      : undefined,
}

export function importTertullian(
  source: EditionSource,
  work: string,
): ImportedEdition {
  const pages = readPages(onlyArchive(source))
  const chaptered = CHAPTERED[work]
  if (chaptered) return importChaptered(pageNamed(pages, chaptered))
  const anchored = ANCHORED[work]
  if (anchored) return importAnchored(anchored.map((p) => pageNamed(pages, p)))
  const books = BOOKS[work]
  if (!books) throw new Error(`No tertullian.org layout for ${work}`)
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  const editorial: EditorialSection[] = []

  books.forEach((page, i) => {
    const $ = pageNamed(pages, page)
    const book = String(i + 1)
    divisions.push({ locator: book, label: `Book ${book}` })
    const blocks: string[] = []
    const notes = readFootnotes($)
    const after: string[] = []
    const online: string[] = []
    for (const p of $("p").toArray()) {
      if (/^\[Footnotes? moved to end\]$/.test($(p).text().trim())) break
      // A footnote, read by readFootnotes.
      if ($(p).find("a[name^='#']").length) continue
      // The online editor's notes on the 1814 edition.
      if ($(p).hasClass("editorial")) {
        online.push(`<p>${inlineHtml($, $(p).contents(), options).trim()}</p>`)
        continue
      }
      // Small print where the rest of a book is lost: the translator's note,
      // and an account from other writers to fill the gap.
      if ($(p).hasClass("smallish")) {
        after.push(`<p>${inlineHtml($, $(p).contents(), options).trim()}</p>`)
        continue
      }
      // The page's title and the book's heading, but not "* * *", where the
      // manuscript breaks off: that is part of the text as printed.
      if (
        $(p).attr("align") &&
        !/^[*\s]+$/.test($(p).text().replace(/\d/g, ""))
      )
        continue
      const html = inlineHtml($, $(p).contents(), options).trim()
      const text = plainText(html)
      if (!text) continue
      if (/^This text was transcribed/.test(text)) break
      // The online editor's notes on the manuscript, not the translation.
      if (/^\[Note (for|to) the online edition/.test(text)) {
        editorial.push({
          id: `ed-${editorial.length + 1}`,
          title: `Note on Book ${book}`,
          html: `<p>${html}</p>`,
          notes: [],
        })
        continue
      }
      blocks.push(html)
    }
    if (online.length)
      editorial.push({
        id: `ed-${editorial.length + 1}`,
        title: `Note on Book ${book}`,
        html: online.join(""),
        notes: [],
      })
    if (after.length)
      editorial.push({
        id: `ed-${editorial.length + 1}`,
        title: `After Book ${book}: what the translator supplied from other writers`,
        html: after.join(""),
        notes: [],
      })
    passages.push({
      locator: `${book}.1`,
      headings: [{ kind: "division", html: `Book ${book}`, editorial: false }],
      division: book,
      blocks,
      notes: notesFor(blocks.join(" "), notes),
      text: plainText(blocks.join(" ")),
    })
  })
  return { divisions, passages, editorial }
}

/**
 * One page of books and numbered chapters: a chapter runs from the paragraph
 * opening with its numeral to the next one, taking verse set apart with it.
 */
function importChaptered($: CheerioAPI): ImportedEdition {
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  const editorial: EditorialSection[] = []
  const notes = readFootnotes($)
  let book = ""
  let chapter: Omit<Passage, "flags"> | undefined
  const finish = () => {
    if (!chapter) return
    chapter.text = plainText(chapter.blocks.join(" "))
    chapter.notes = notesFor(chapter.blocks.join(" "), notes)
    passages.push(chapter)
    chapter = undefined
  }

  // The dedication to Valens, before Book 1, which the Latin edition leaves out.
  const dedication: string[] = []
  for (const el of $("h3, p").toArray()) {
    const $el = $(el)
    if ($el.hasClass("editorial")) break // "[Notes moved to the end …]"
    const html = inlineHtml($, $el.contents(), options).trim()
    const text = plainText(html)
    if (el.name === "h3") {
      const numeral = /^BOOK ([IVXL]+)\.$/.exec(text)?.[1]
      if (!numeral) continue
      finish()
      book = String(romanToInt(numeral))
      divisions.push({ locator: book, label: `Book ${book}` })
      continue
    }
    if (!text || /^-+$/.test(text)) continue
    if (!book) {
      if (!/^Justin, Cornelius Nepos/.test(text))
        dedication.push(`<p>${html}</p>`)
      continue
    }
    // Watson's contents of the book: "Origin of Rome, I.----…"
    if ($el.is(".small, .smallish")) {
      editorial.push({
        id: `ed-${editorial.length + 1}`,
        title: `Watson's contents of Book ${book}`,
        html: `<p>${html}</p>`,
        notes: [],
      })
      continue
    }
    const opening = /^([IVXL]+)[.,]\s+/.exec(text)?.[1]
    if (opening) {
      finish()
      const locator = `${book}.${romanToInt(opening)}`
      chapter = {
        locator,
        headings: passages.some((p) => p.division === book)
          ? []
          : [{ kind: "division", html: `Book ${book}`, editorial: false }],
        division: book,
        blocks: [html.replace(/^([IVXL]+)[.,]\s+/, "")],
        notes: [],
        text: "",
      }
      continue
    }
    if (!chapter)
      throw new Error(
        `Book ${book}: text before its first chapter: ${text.slice(0, 60)}`,
      )
    chapter.blocks.push(html)
  }
  finish()
  if (dedication.length)
    editorial.unshift({
      id: "ed-0",
      title: "Dedication to Valens",
      html: dedication.join(""),
      notes: notesFor(dedication.join(" "), notes),
    })
  return { divisions, passages, editorial }
}

/** A page per book, its chapters opened by `span.chapterno a[name=C3]`. */
function importAnchored(books: CheerioAPI[]): ImportedEdition {
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  const anchoredOptions = {
    ...options,
    drop: (el: Element) => /\b(pb|verse)\b/.test(el.attribs.class ?? ""),
  }
  books.forEach(($, i) => {
    const book = String(i + 1)
    divisions.push({ locator: book, label: `Book ${book}` })
    const notes = new Map<string, string>()
    let pending: Heading[] = [
      { kind: "division", html: `Book ${book}`, editorial: false },
    ]
    let chapter: Omit<Passage, "flags"> | undefined
    for (const el of $("h3, p").toArray()) {
      const $el = $(el)
      const text = $el.text().replace(/\s+/g, " ").trim()
      // Echols' notes: <a name="12"></a>12.&nbsp;<sup>12</sup> …
      const note = $el.children("a[name]").first().attr("name")
      if (el.name === "p" && note && /^\d+$/.test(note)) {
        const html = inlineHtml($, $el.contents(), anchoredOptions)
          .trim()
          .replace(
            new RegExp(`^${note}\\.\\s*(<sup>\\s*${note}\\s*</sup>)?\\s*`),
            "",
          )
        notes.set(note, html)
        continue
      }
      if (/^This text was transcribed/.test(text)) break
      if (el.name === "h3") {
        // "BOOK ONE" is the division's own heading.
        if (text && !/^BOOK [A-Z]+$/.test(text))
          pending.push({
            kind: "section",
            html: inlineHtml($, $el.contents(), anchoredOptions).trim(),
            editorial: false,
          })
        continue
      }
      const opens = /^C(\d+)$/.exec(
        $el.find("span.chapterno a[name]").attr("name") ?? "",
      )?.[1]
      if (opens) {
        chapter = {
          locator: `${book}.${opens}`,
          headings: pending,
          division: book,
          blocks: [],
          notes: [],
          text: "",
        }
        pending = []
        passages.push(chapter)
        continue
      }
      if ($el.attr("align") === "center" || !chapter) continue
      const html = inlineHtml($, $el.contents(), anchoredOptions)
        .trim()
        .replace(/^(&nbsp;|\s)+/, "")
      if (plainText(html)) chapter.blocks.push(html)
    }
    for (const p of passages.filter((p) => p.division === book)) {
      p.notes = notesFor(p.blocks.join(" "), notes)
      p.text = plainText(p.blocks.join(" "))
    }
  })
  return { divisions, passages, editorial: [] }
}

function pageNamed(pages: Map<string, CheerioAPI>, page: string): CheerioAPI {
  const $ = pages.get(`pages/${page}.htm`)
  if (!$) throw new Error(`pages/${page}.htm is not in the intake archive`)
  return $
}

/** The translator's footnotes after "[Footnotes moved to end]", each opened by <a name="#1">. */
function readFootnotes($: CheerioAPI): Map<string, string> {
  const notes = new Map<string, string>()
  for (const anchor of $("a[name^='#']").toArray()) {
    const id = (anchor.attribs.name ?? "").slice(1)
    const html = inlineHtml($, $(anchor).parent().contents())
      .trim()
      .replace(new RegExp(`^${id}\\.\\s*`), "")
      // Watson's markers, *, + and ++, from the foot of the printed page.
      .replace(/^<i>\s*[*+]+\s*<\/i>\s*/, "")
      .replace(/^(<i>)?\s*[*+]+\.?\s*/, "$1")
    notes.set(id, html)
  }
  return notes
}

/** Every page from one unchanged intake zip, refusing a zip whose checksum moved. */
function readPages(intake: {
  file: string
  sha256: string
}): Map<string, CheerioAPI> {
  const archive = readFileSync(path.join(INTAKE_DIR, intake.file))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== intake.sha256)
    throw new Error(
      `${intake.file}: checksum ${sha256} does not match the manifest's ${intake.sha256}`,
    )
  const files = unzipSync(new Uint8Array(archive), {
    filter: (f) => f.name.endsWith(".htm"),
  })
  return new Map(
    Object.entries(files).map(([name, bytes]) => [
      name,
      load(new TextDecoder("windows-1252").decode(bytes)),
    ]),
  )
}
