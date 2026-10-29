// Texts transcribed by Roger Pearse on tertullian.org, saved page by page into
// one intake zip: one page per book, each a run of <P> paragraphs, with print
// page numbers as <span class="pb">|6</span>.
//
// Zosimus, New History (London: Green and Chaplin, 1814) prints no chapter
// numbers, so each book arrives as one Passage at chapter 1; split Corrections,
// found by aligning the English with Mendelssohn's Greek chapters
// (scripts/align-chapters.ts) and checked by reading, start the others.

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
  type ImportedEdition,
  type Passage,
} from "../corpus.ts"
import { notesFor } from "./eutropius.ts"
import { inlineHtml, onlyArchive, plainText } from "./gutenberg.ts"

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

export function importTertullian(
  source: EditionSource,
  work: string,
): ImportedEdition {
  const books = BOOKS[work]
  if (!books) throw new Error(`No tertullian.org layout for ${work}`)
  const pages = readPages(onlyArchive(source))
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  const editorial: EditorialSection[] = []
  const options = {
    drop: (el: Element) => /\bpb\b/.test(el.attribs.class ?? ""),
    // The translator's footnotes, moved to the end of the page: <a href="#1"><sup>1</sup></a>.
    noteRef: (el: Element) =>
      el.name === "a" && /^#\d+$/.test(el.attribs.href ?? "")
        ? (el.attribs.href ?? "").slice(1)
        : undefined,
  }

  books.forEach((page, i) => {
    const $ = pages.get(`pages/${page}.htm`)
    if (!$) throw new Error(`pages/${page}.htm is not in the intake archive`)
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

/** The translator's footnotes after "[Footnotes moved to end]", each opened by <a name="#1">. */
function readFootnotes($: CheerioAPI): Map<string, string> {
  const notes = new Map<string, string>()
  for (const anchor of $("a[name^='#']").toArray()) {
    const id = (anchor.attribs.name ?? "").slice(1)
    const html = inlineHtml($, $(anchor).parent().contents())
      .trim()
      .replace(new RegExp(`^${id}\\.\\s*(\\*\\s*)?`), "")
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
