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

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { load } from "cheerio"
import type { Element } from "domhandler"
import { unzipSync } from "fflate"
import {
  INTAKE_DIR,
  type IntakeArchive,
  type Division,
  type EditionSource,
  type EditorialSection,
  type Heading,
  type ImportedEdition,
  type Passage,
} from "../corpus.ts"
import {
  escapeHtml,
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

/**
 * The Latin from The Latin Library, a page per book (14.shtml to 31.shtml),
 * by book, chapter and section to match Yonge. Two layouts: Books 14 to 22
 * (saved in UTF-16) give each chapter as one paragraph, `<a name="22.1">[1]`,
 * its sections marked inline `<font size=1>2</font>`; Books 23 to 31 head a
 * chapter `<a name="1">I</a>` and give each section a paragraph, "2. …". The
 * italic chapter summaries are the site's and are left out.
 */
export function importAmmianusLatin(source: EditionSource): ImportedEdition {
  const archive = onlyArchive(source)
  const files = unzipSync(new Uint8Array(readIntake(archive)))
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  const books = Object.keys(files)
    .map((name) => Number(/(\d+)\.shtml$/.exec(name)?.[1]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  for (const n of books) {
    const bytes = files[`ammianus/${n}.shtml`] ?? new Uint8Array()
    const html = decode(bytes)
    const book = String(n)
    divisions.push({ locator: book, label: `Book ${book}` })
    const add = (chapter: string, section: string, raw: string) => {
      const text = load(`<p>${raw}</p>`).text().replace(/\s+/g, " ").trim()
      if (!text) return
      passages.push({
        locator: `${book}.${chapter}.${section}`,
        headings: passages.some((p) => p.division === book)
          ? []
          : [{ kind: "division", html: `Book ${book}`, editorial: false }],
        division: book,
        blocks: [escapeHtml(text)],
        notes: [],
        text,
      })
    }
    let chapter = ""
    const marker = /<font\s+size=1>\s*(\d+)\s*<\/font>/i
    for (const [, inner = ""] of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      // Books 14 to 22: a chapter's first paragraph opens <a name="22.1">[1]</a>;
      // every paragraph marks its sections inline.
      const inline = new RegExp(
        `<a name="${book}\\.(\\d+)">[^<]*</a>`,
        "i",
      ).exec(inner)
      if (inline?.[1]) chapter = inline[1]
      if (chapter && marker.test(inner)) {
        const body = inline
          ? inner.slice(inline.index + inline[0].length)
          : inner
        const pieces = body.split(new RegExp(marker.source, "gi"))
        if (plainOf(pieces[0] ?? "")) extend(pieces[0] ?? "")
        for (let i = 1; i < pieces.length; i += 2)
          add(chapter, pieces[i] ?? "", pieces[i + 1] ?? "")
        continue
      }
      // Books 23 to 31: <b><a name="4">IV</a></b>, then "1. …" paragraphs.
      // The anchor's name is the chapter, or, where it is blank, its numeral.
      const head = /<a name="(\d*)">\s*([IVXL]*)\s*<\/a>/i.exec(inner)
      if (head && (head[1] || head[2])) {
        chapter = head[1] || String(romanToInt(head[2] ?? ""))
        continue
      }
      const section = /^\s*(\d+)\.\s+([\s\S]*)$/.exec(inner)
      if (chapter && section?.[1]) add(chapter, section[1], section[2] ?? "")
      else if (chapter && !/class=/.test(inner)) extend(inner)
    }
    // A paragraph without a number carries on the section before it.
    function extend(raw: string) {
      const last = passages.at(-1)
      const more = plainOf(raw)
      if (last && more && last.division === book) {
        last.blocks.push(escapeHtml(more))
        last.text += ` ${more}`
      }
    }
  }
  return { divisions, passages, editorial: [] }
}

/** The intake zip's bytes, refusing one whose checksum moved. */
function readIntake(intake: IntakeArchive): Buffer {
  const archive = readFileSync(path.join(INTAKE_DIR, intake.file))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== intake.sha256)
    throw new Error(
      `${intake.file}: checksum ${sha256} does not match the manifest's ${intake.sha256}`,
    )
  return archive
}

const plainOf = (raw: string) =>
  load(`<p>${raw}</p>`).text().replace(/\s+/g, " ").trim()

/** The Latin Library saves these pages as UTF-16, UTF-8 or Windows-1252. */
function decode(bytes: Uint8Array): string {
  // With or without its byte-order mark (FF FE).
  if (bytes[1] === 0 || (bytes[0] === 0xff && bytes[1] === 0xfe))
    return new TextDecoder("utf-16le").decode(bytes)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}
