// Greek and Latin texts in the TEI EpiDoc of the Perseus Digital Library and
// Open Greek and Latin (First1KGreek), one XML file in an intake zip. Books,
// chapters and sections are <div type="textpart" subtype="…" n="…">. Passages
// are chapters, a paragraph to each section; a section Locator such as
// `1.18.2` lands on its chapter. The
// editor's additions (<add>) print in angle brackets ⟨…⟩ and deletions (<del>)
// in square brackets, as in the printed edition; print page breaks are dropped.
// An unnumbered <lb/> starts a verse line (an oracle quoted in Zosimus); a
// numbered one only counts the printed page's lines (Zonaras), so it is a
// space, and a word hyphenated across it is joined again. The editor's
// footnotes become the chapter's notes; marginal sigla are dropped.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { load, type CheerioAPI } from "cheerio"
import type { AnyNode } from "domhandler"
import { unzipSync } from "fflate"
import {
  INTAKE_DIR,
  type Division,
  type EditionSource,
  type ImportedEdition,
  type Passage,
} from "../corpus.ts"
import { escapeHtml, onlyArchive, plainText } from "./gutenberg.ts"

export function importPerseus(source: EditionSource): ImportedEdition {
  const $ = readTei(onlyArchive(source))
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []

  for (const book of $('div[subtype="book"]').toArray()) {
    const n = $(book).attr("n") ?? ""
    const label = n === "praef" ? "Preface" : `Book ${n}`
    divisions.push({ locator: n, label })
    $(book)
      .children('div[subtype="chapter"]')
      .each((i, chapter) => {
        const locator = `${n}.${$(chapter).attr("n") ?? ""}`
        // A paragraph per section, as the edition's sections fall.
        const blocks = $(chapter)
          .find("p")
          .toArray()
          .map((p) => clean(inline($, p.children)))
          .filter(Boolean)
        const notes = $(chapter)
          .find('note[type="footnote"]')
          .toArray()
          .map((note, i) => ({
            id: `${locator}-${i + 1}`,
            label: `${$(chapter).attr("n") ?? ""}.${i + 1}`,
            html: clean(inline($, note.children)),
          }))
        passages.push({
          locator,
          headings:
            i === 0
              ? [{ kind: "division", html: label, editorial: false }]
              : [],
          division: n,
          blocks,
          notes,
          text: plainText(blocks.join(" ")),
        })
      })
  }
  return { divisions, passages, editorial: [] }
}

/**
 * A poem cited by line (the Sibylline Oracles): books of <p> sense paragraphs,
 * one verse per line of text or per <l>, with <lb n="5"/> before every fifth.
 * Each paragraph is a Passage named by its book and first line, `13.13`, its
 * verses kept as lines. The count follows the edition's own line numbers
 * wherever they are printed, and says where it had to. A prose book (the
 * preface) is read the same way but runs its lines together.
 */
export function importPerseusLines(source: EditionSource): ImportedEdition {
  const $ = readTei(onlyArchive(source))
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []

  for (const book of $('div[subtype="book"]').toArray()) {
    const n = $(book).attr("n") ?? ""
    const prose = n === "praef"
    const label = prose ? "Preface" : `Book ${n}`
    divisions.push({ locator: n, label })
    // Paragraphs between \uE002 and \uE003, printed line numbers as \uE001n\uE001.
    const marked = lines(book.children).replace(
      /\uE001(\d+)\uE001\s*\uE002/g,
      "\uE002\uE001$1\uE001",
    )
    let line = 0
    const corrected: string[] = []
    for (const [, paragraph = ""] of marked.matchAll(
      /\uE002([^\uE003]*)\uE003/g,
    )) {
      const verses: { n: number; html: string }[] = []
      let printed: number | undefined
      for (const raw of paragraph.split("\n")) {
        for (const [, m] of raw.matchAll(/\uE001(\d+)\uE001/g))
          printed = Number(m)
        const html = clean(raw.replace(/\uE001\d+\uE001/g, ""))
        if (!html) continue
        line += 1
        if (printed !== undefined && printed !== line) {
          corrected.push(`${line}→${printed}`)
          line = printed
        }
        printed = undefined
        verses.push({ n: line, html })
      }
      const first = verses[0]
      if (!first) continue
      const blocks = [
        prose
          ? clean(verses.map((v) => v.html).join(" "))
          : verses.map((v) => v.html).join("<br>"),
      ]
      passages.push({
        locator: `${n}.${first.n}`,
        headings: passages.some((p) => p.division === n)
          ? []
          : [{ kind: "division", html: label, editorial: false }],
        division: n,
        blocks,
        notes: [],
        text: plainText(blocks.join(" ").replace(/<br>/g, " ")),
      })
    }
    if (corrected.length)
      console.warn(
        `Book ${n}: line count set by the printed numbers at ${corrected.join(", ")}`,
      )
  }
  return { divisions, passages, editorial: [] }
}

/** A poem's book as text, its paragraphs and printed line numbers marked; notes, page breaks and headings dropped. */
function lines(nodes: AnyNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.data)
      if (node.type !== "tag") return ""
      const inner = lines(node.children)
      switch (node.name) {
        case "note":
        case "pb":
        case "head":
        case "milestone":
          return ""
        case "lb":
          return node.attribs.n ? `\n\uE001${node.attribs.n}\uE001` : "\n"
        case "l":
          return `\n${inner}\n`
        // Books 4 and 5 group their verses by printed page, in <lg>, not by sense.
        case "p":
        case "lg":
          return `\uE002${inner}\uE003`
        case "gap":
          return " … "
        case "add":
          return `⟨${inner}⟩`
        case "del":
          return `[${inner}]`
        default:
          return inner
      }
    })
    .join("")
}

/**
 * Collapses whitespace, joins a word the printer broke across a line
 * ("αἰτιώμε- νον"), and normalizes to NFC, so the polytonic accent forms
 * (oxia, U+1F71…) match the ones a keyboard types (tonos).
 */
function clean(html: string): string {
  return html
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/(\p{L})- (?=\p{Ll})/gu, "$1")
    .trim()
}

function inline($: CheerioAPI, nodes: AnyNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.data)
      if (node.type !== "tag") return ""
      const inner = inline($, node.children)
      switch (node.name) {
        case "pb":
          return ""
        case "lb":
          return node.attribs.n ? " " : "<br>"
        case "l":
          return `<br>${inner}`
        case "note":
        case "milestone":
          return ""
        case "gap":
          return " … "
        case "add":
          return `⟨${inner}⟩`
        case "del":
          return `[${inner}]`
        default:
          return inner
      }
    })
    .join("")
}

/** The one TEI file in an unchanged intake zip, refusing a zip whose checksum moved. */
function readTei(intake: { file: string; sha256: string }): CheerioAPI {
  const archive = readFileSync(path.join(INTAKE_DIR, intake.file))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== intake.sha256)
    throw new Error(
      `${intake.file}: checksum ${sha256} does not match the manifest's ${intake.sha256}`,
    )
  const files = unzipSync(new Uint8Array(archive), {
    filter: (f) => f.name.endsWith(".xml"),
  })
  const [name, ...others] = Object.keys(files)
  if (!name || others.length)
    throw new Error(`${intake.file}: expected one XML file`)
  return load(new TextDecoder().decode(files[name]), { xml: true })
}
