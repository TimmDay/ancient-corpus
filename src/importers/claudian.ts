// Claudian's poems, ed. and tr. Maurice Platnauer (Loeb, 1922), transcribed
// by Bill Thayer on LacusCurtius: an English page and a Latin page for each
// poem or book, saved into one intake zip.
//
// Platnauer's English is prose, a paragraph for a run of verses; each
// paragraph opens with a link to the Latin line it starts at (`<a name="39">`,
// sometimes a line he numbers `87A`). A Passage is one paragraph, named by
// that line; a preface, printed without links and numbered apart, is one
// Passage, `praef`. A Work of several books puts the book first (`2.54`,
// `2.praef`). The Latin page anchors every line by number (`name="39"` or
// `id="P39"`), and the line numbers in its margin are `a.sec` links, which
// are dropped; the Latin of a Passage is its lines from the paragraph's
// line up to the next paragraph's.

import type { CheerioAPI } from "cheerio"
import type { AnyNode, Element } from "domhandler"
import type {
  Division,
  EditionSource,
  ImportedEdition,
  Passage,
} from "../corpus.ts"
import { notesFor, onlyArchive, plainText } from "./gutenberg.ts"
import { readIntakePages, readPage } from "./lacuscurtius.ts"

type Draft = Omit<Passage, "flags">

/** A poem, or a book of one, and its page under `Roman/Texts/Claudian/`; by Work title. */
type Book = {
  page: string
  book?: string
  label?: string
  /** Each section is one Passage, numbered from 1: the Fescennine Verses' four poems. */
  whole?: boolean
}

export const CLAUDIAN: Record<string, Book[]> = {
  "Panegyricus dictus Probino et Olybrio consulibus": [
    { page: "Probino_et_Olybrio*" },
  ],
  "In Rufinum": [
    { page: "In_Rufinum/1*", book: "1", label: "Book I" },
    { page: "In_Rufinum/2*", book: "2", label: "Book II" },
  ],
  "De Bello Gildonico": [{ page: "De_Bello_Gildonico*" }],
  "In Eutropium": [
    { page: "In_Eutropium/1*", book: "1", label: "Book I" },
    { page: "In_Eutropium/2*", book: "2", label: "Book II" },
  ],
  "Fescennina de Nuptiis Honorii Augusti": [
    { page: "Fescennina*", whole: true },
  ],
  "Epithalamium de Nuptiis Honorii Augusti": [{ page: "Epithalamium*" }],
  "De Tertio Consulatu Honorii": [{ page: "De_III_Consulatu_Honorii*" }],
  "Panegyricus de Quarto Consulatu Honorii Augusti": [
    { page: "De_IV_Consulatu_Honorii*" },
  ],
  "Panegyricus dictus Manlio Theodoro consuli": [{ page: "Manlio_Theodoro*" }],
  "De Consulatu Stilichonis": [
    { page: "De_Consulatu_Stilichonis/1*", book: "1", label: "Book I" },
    { page: "De_Consulatu_Stilichonis/2*", book: "2", label: "Book II" },
    { page: "De_Consulatu_Stilichonis/3*", book: "3", label: "Book III" },
  ],
  "Panegyricus de Sexto Consulatu Honorii Augusti": [
    { page: "De_VI_Consulatu_Honorii*" },
  ],
  "De Bello Gothico": [{ page: "De_Bello_Gothico*" }],
  "De Raptu Proserpinae": [
    { page: "De_Raptu_Proserpinae/1*", book: "1", label: "Book I" },
    { page: "De_Raptu_Proserpinae/2*", book: "2", label: "Book II" },
    { page: "De_Raptu_Proserpinae/3*", book: "3", label: "Book III" },
  ],
}

const FOLDER = "pages/{side}/Roman/Texts/Claudian"

export function importClaudian(
  source: EditionSource,
  work: string,
  language: string,
): ImportedEdition {
  const books = CLAUDIAN[work]
  if (!books) throw new Error(`No Claudian layout for ${work}`)
  const pages = readIntakePages(onlyArchive(source))
  const page = (side: "E" | "L", book: Book) => {
    const file = `${FOLDER.replace("{side}", side)}/${book.page}.html`
    const $ = pages.get(file)
    if (!$) throw new Error(`${file} is not in the intake archive`)
    return $
  }
  const divisions: Division[] = []
  const passages: Draft[] = []
  let nextNoteId = 1
  for (const book of books) {
    const division = book.book ?? ""
    if (book.book)
      divisions.push({ locator: book.book, label: book.label ?? book.book })
    const prefix = book.book ? `${book.book}.` : ""
    const $e = page("E", book)
    const starts = markStarts($e, prefix, book.whole ?? false)
    const english = readPage($e, division, nextNoteId, undefined, "named")
    nextNoteId += english.notes.size
    const own =
      language === "en"
        ? english.passages.map((p) => ({
            ...p,
            // A note on a title has nowhere to show, so it is left out.
            headings: p.headings.map((h) => ({
              ...h,
              html: h.html.replace(/<sup class="nref">.*?<\/sup>/g, ""),
            })),
            notes: notesFor(p.blocks.join(" "), english.notes).map((n) => ({
              ...n,
              label: english.labels.get(n.id) ?? n.id,
            })),
          }))
        : latinPassages(page("L", book), starts, english.passages, prefix)
    if (book.book && own[0])
      own[0].headings.unshift({
        kind: "division",
        html: book.label ?? book.book,
        editorial: false,
      })
    for (const p of own) {
      p.division = division
      p.text = plainText(p.blocks.join(" "))
      passages.push(p)
    }
  }
  return { divisions, passages, editorial: [] }
}

type Start = { locator: string; section: number; line: string }

/** LacusCurtius names the paragraph at line 170A of the Fourth Consulship `1Ἀ`. */
const MISNAMED: Record<string, string> = { "1Ἀ": "170A" }

/**
 * Marks where each Passage starts in the English, as the `a.sec` anchors
 * `readPage` cuts at, and returns the starts in order. A section is a run
 * of text under one heading that names a preface or a poem.
 */
function markStarts($: CheerioAPI, prefix: string, whole_: boolean): Start[] {
  // `readPage` reads from the first h1 to the notes: the page's own h1s
  // become h2s, and an h1 is put before the title.
  $("h1").each((_, h) => {
    h.name = "h2"
  })
  const body = $("h2").first()
  body.before("<h1></h1>")
  const starts: Start[] = []
  let section = -1
  let preface = false
  for (const el of $("h1").first().nextUntil("hr.endnotes").toArray()) {
    if (/^h[2-6]$/.test(el.name)) {
      const text = $(el).text().replace(/\s+/g, " ").trim()
      const kind = sectionKind(text)
      // A heading straight after another (BOOK I, then (XXI)) opens no new section.
      if (kind) {
        if (section < 0 || starts.some((s) => s.section === section)) section++
        preface = kind === "preface"
      }
      continue
    }
    if (el.name !== "p") continue
    const line = $(el)
      .find("a[name]")
      .toArray()
      .map((a) => MISNAMED[a.attribs.name ?? ""] ?? a.attribs.name ?? "")
      .find((name) => /^\d+A?$/.test(name))
    // A poem printed without a heading of its own starts at its first line.
    if (section < 0 && line !== undefined) section = 0
    if (section < 0) continue
    // A section whose first paragraph has no link is a preface (the Gothic
    // War's is headed only by its number), or in the Fescennine Verses a poem.
    const first = !starts.some((s) => s.section === section)
    const whole = whole_ || preface || (first && line === undefined)
    const opens = whole ? first : line !== undefined
    if (!opens) continue
    const locator = whole_
      ? `${prefix}${section + 1}`
      : whole
        ? `${prefix}praef`
        : `${prefix}${line}`
    starts.push({ locator, section, line: whole ? "" : (line ?? "") })
    $(el).prepend(`<a class="sec" name="${locator}"></a>`)
  }
  return starts
}

/** "preface" or "poem" for a heading that opens one, else undefined (a title, a page number). */
function sectionKind(heading: string): "preface" | "poem" | undefined {
  // The page's title names the poet; the title of a book or preface does not.
  if (/claudian/i.test(heading)) return undefined
  if (/pr(a|ae|e)fa/i.test(heading)) return "preface"
  if (
    /\b(book|liber|panegyric|epithalami|poem)|^\(?[IVXL]+\)?(\s|$)/i.test(
      heading.replace(/^(vol\.\s*[IV]+\s*)?p\d+\s*/i, ""),
    )
  )
    return "poem"
  return undefined
}

/**
 * The Latin for each English Passage: the lines from its start up to the next
 * one's. Lines are read in page order, broken at `<br>` and at each table
 * cell, and named by the anchor that opens them.
 */
function latinPassages(
  $: CheerioAPI,
  starts: Start[],
  english: Draft[],
  prefix: string,
): Draft[] {
  const { lines, headings } = readLines($)
  const passages: Draft[] = english.map((p, i) => ({
    locator: p.locator,
    // The Latin page's own heading opens each section.
    headings:
      starts.findIndex((s) => s.section === starts[i]?.section) === i
        ? (headings.get(starts[i]?.section ?? -1) ?? []).map((html) => ({
            kind: "section" as const,
            html,
            editorial: false,
          }))
        : [],
    division: p.division,
    blocks: [],
    notes: [],
    text: "",
  }))
  // A paragraph Platnauer starts mid-verse (`500A`) is linked to an anchor
  // inside the verse; where the Latin page has none, it starts with the verse.
  const names = new Set(lines.map((l) => `${l.section}:${l.name}`))
  const target = (s: Start) =>
    names.has(`${s.section}:${s.line}`) ? s.line : s.line.replace(/A$/, "")
  // Prefaces carry no line links: a preface takes its section's lines whole.
  let at = -1
  let section = -1
  for (const line of lines) {
    if (line.section !== section) {
      section = line.section
      const first = starts.findIndex((s) => s.section === section)
      if (first < 0)
        throw new Error(`${prefix}: Latin section ${section} has no English`)
      at = first
    }
    const next = starts[at + 1]
    if (next?.section === section && line.name === target(next)) at++
    passages[at]?.blocks.push(line.html)
  }
  for (const [i, p] of passages.entries()) {
    if (!p.blocks.length)
      throw new Error(`${p.locator}: no Latin lines (start ${starts[i]?.line})`)
    p.blocks = [p.blocks.join(" <br>")]
  }
  return passages
}

/** Every verse on a Latin page, by section, with the line anchor it opens with. */
function readLines($: CheerioAPI): {
  lines: { section: number; name: string; html: string }[]
  headings: Map<number, string[]>
} {
  const lines: { section: number; name: string; html: string }[] = []
  const headings = new Map<number, string[]>()
  let section = -1
  let current: { name: string; parts: string[] } | undefined
  const flush = () => {
    if (!current) return
    const html = current.parts.join("").replace(/\s+/g, " ").trim()
    if (section >= 0 && plainText(html))
      lines.push({ section, name: current.name, html })
    current = undefined
  }
  // The text ends at the first rule after it: Platnauer's Latin notes and
  // the site's footer follow.
  let ended = false
  const walk = (node: AnyNode) => {
    if (ended) return
    if (node.type === "text") {
      ;(current ??= { name: "", parts: [] }).parts.push(
        escape((node as unknown as { data: string }).data),
      )
      return
    }
    if (node.type !== "tag") return
    const el = node as Element
    const classes = el.attribs.class ?? ""
    if (/^h[1-6]$/.test(el.name)) {
      flush()
      const kind = sectionKind($(el).text().replace(/\s+/g, " ").trim())
      if (kind && (section < 0 || lines.at(-1)?.section === section)) section++
      if (kind) {
        const text = $(el)
          .clone()
          .find(".pagenum")
          .remove()
          .end()
          .text()
          .replace(/\s+/g, " ")
          .trim()
        headings.set(section, [...(headings.get(section) ?? []), escape(text)])
      }
      return
    }
    if (el.name === "hr" && lines.length) {
      flush()
      ended = true
      return
    }
    if (/\b(sec|pagenum)\b/.test(classes)) return
    if (el.name === "br" || el.name === "td" || el.name === "p") flush()
    if (el.name === "a") {
      const name = (el.attribs.name ?? el.attribs.id ?? "").replace(/^P/, "")
      if (/^(Praef\.)?\d+A?$/i.test(name)) {
        flush()
        if (section < 0) section = 0
        current = { name: name.replace(/^Praef\./i, ""), parts: [] }
      }
    }
    const tag = { i: "i", em: "i", b: "b" }[el.name]
    if (tag) current?.parts.push(`<${tag}>`)
    for (const child of el.children) walk(child)
    if (tag) current?.parts.push(`</${tag}>`)
    if (el.name === "td" || el.name === "p") flush()
  }
  for (const el of $("body").children().toArray()) walk(el)
  flush()
  return { lines, headings }
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
