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

import type { Cheerio, CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import type {
  Division,
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
  plainText,
  readIntakeHtml,
} from "./gutenberg.ts"

const SECTION_MARK = /\[(\d{1,3}|[A-D])\]\s*/g

type Side = "grc" | "en"

/** One piece of Wright's volumes: its heading, and where its Passages go. */
export type JulianPiece = {
  /** The piece's h1 in the transcription, e.g. "Oration VI". */
  heading: string
  /** The Division it fills, or "" for a Work of one piece. */
  division: string
  /** Its Division's label, e.g. "Oration VI". */
  label?: string
  /** Prefixed to each Locator, e.g. "6." for `6.181a`. */
  prefix?: string
  /** The Spanheim section before the first printed marker. */
  start: { page: number; letter: string }
  /** How many title paragraphs open the piece, Greek and English together. */
  titleLines: number
}

export const CAESARES: JulianPiece[] = [
  {
    heading: "The Caesars",
    division: "",
    start: { page: 306, letter: "a" },
    titleLines: 4,
  },
]

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
// Spanheim's pages run on from one oration to the next; each oration starts
// on the page its first printed marker comes after.
const FIRST_MARK = [2, 50, 102, 131, 159, 181, 204, 240]

export const ORATIONS: JulianPiece[] = ROMAN.map((n, i) => ({
  heading: `Oration ${n}`,
  division: String(i + 1),
  prefix: `${i + 1}.`,
  start: { page: (FIRST_MARK[i] ?? 0) - 1, letter: "" },
  titleLines: i === 0 ? 2 : 4,
}))

export const MISOPOGON: JulianPiece[] = [
  {
    heading: "Misopogon, Or, Beard-Hater",
    division: "",
    start: { page: 337, letter: "" },
    titleLines: 4,
  },
]

export const LETTERS: JulianPiece[] = [
  {
    heading: "Letter to Themistius the Philosopher",
    division: "themistius",
    label: "To Themistius",
    start: { page: 253, letter: "" },
    titleLines: 4,
  },
  {
    heading: "Letter to the Senate and People of Athens",
    division: "athenians",
    label: "To the Athenians",
    start: { page: 268, letter: "" },
    titleLines: 4,
  },
  {
    heading: "Fragment of a Letter to a Priest",
    division: "priest",
    label: "Fragment of a Letter to a Priest",
    start: { page: 288, letter: "" },
    titleLines: 1,
  },
]

export function importJulianCaesars(
  source: EditionSource,
  _work: Work,
  edition: Edition,
): ImportedEdition {
  return importJulian(source, edition, CAESARES)
}

/**
 * Wright's pieces from any of the archives, in archive order. A piece whose
 * heading is not in an archive is looked for in the next one.
 */
export function importJulian(
  source: EditionSource,
  edition: Edition,
  pieces: JulianPiece[],
): ImportedEdition {
  const language = edition.language as Side
  const passages: Omit<Passage, "flags">[] = []
  const divisions: Division[] = []
  const editorial: EditorialSection[] = []
  const found = new Set<string>()
  for (const archive of source.archives) {
    const $ = readIntakeHtml(archive)
    styleInline($)
    const notes = readNotes($)
    for (const piece of pieces) {
      const h1 = $("h1")
        .filter((_, h) => squash($(h).text()) === piece.heading)
        .first()
      if (!h1.length) continue
      found.add(piece.heading)
      const own = readPiece($, h1, piece, language, notes)
      passages.push(...own.passages)
      if (piece.division)
        divisions.push({
          locator: piece.division,
          label: piece.label ?? piece.heading,
        })
      if (own.intro && language === "en")
        editorial.push({
          id: `ed-${editorial.length + 1}`,
          title: own.intro.title,
          html: own.intro.html,
          notes: notesFor(own.intro.html, notes),
        })
    }
  }
  const missing = pieces.filter((p) => !found.has(p.heading))
  if (missing.length)
    throw new Error(`No heading for ${missing.map((p) => p.heading)}`)
  return { divisions, passages, editorial }
}

function readPiece(
  $: CheerioAPI,
  h1: Cheerio<Element>,
  piece: JulianPiece,
  language: Side,
  notes: Map<string, string>,
): {
  passages: Omit<Passage, "flags">[]
  intro?: { title: string; html: string }
} {
  const options = {
    noteRef: (el: Element) => {
      const href = el.attribs.href ?? ""
      return el.name === "a" && href.startsWith("#note_")
        ? href.replace("#note_", "")
        : undefined
    },
    drop: (el: Element) => /\btei-pb\b/.test(el.attribs.class ?? ""),
  }
  // Most pieces hold an introduction div and a text div; Oration I has no
  // introduction, and its paragraphs follow the heading directly.
  const [first, second] = h1.parent().children("div").toArray()
  const intro = second ? first : undefined
  const text = second ?? h1.parent().get(0)
  if (!text) throw new Error(`${piece.heading}: no text`)

  const passages: Omit<Passage, "flags">[] = []
  const titleLines: Record<Side, string[]> = { grc: [], en: [] }
  let titleSeen = 0
  let section = { ...piece.start }
  const locator = () => `${piece.prefix ?? ""}${section.page}${section.letter}`
  // Moves the running section past each marker, and drops the markers. The
  // transcription leaves out the page markers 168 and 298; a letter that
  // does not follow the one before can only be on the next page.
  const pass = (html: string) =>
    html.replace(SECTION_MARK, (_, mark: string) => {
      const letter = mark.toLowerCase()
      section = /\d/.test(mark)
        ? { page: Number(mark), letter: "a" }
        : letter > section.letter
          ? { page: section.page, letter }
          : { page: section.page + 1, letter }
      return ""
    })
  const add = (side: Side, html: string) => {
    const current = passages.at(-1)
    if (!current)
      throw new Error(
        `${piece.heading}: text before the first Passage: ${html}`,
      )
    if (side === language) current.blocks.push(html.trim())
  }

  for (const el of $(text).children().toArray()) {
    const $el = $(el)
    if ($el.is("p")) {
      const html = inlineHtml($, $el.contents(), options).trim()
      if (!html || html.startsWith("[Transcriber's Note")) continue
      if (titleSeen < piece.titleLines) {
        titleSeen++
        const wrapped = /^\(/.test(html)
        // A note on a title line has nowhere to show, so it is left out.
        const line = pass(html).replace(/<sup class="nref">.*?<\/sup>/g, "")
        titleLines[wrapped ? "en" : "grc"].push(unwrap(line))
        continue
      }
      const side = sideOf(html)
      if (side === "en") {
        add("en", unwrap(html))
        continue
      }
      const leading = html.match(/^\[(\d{1,3}|[A-D])\]/)
      if (leading) pass(leading[0])
      const start = locator()
      const body = pass(html.slice(leading?.[0].length ?? 0)).trim()
      const opens = /^\p{Lu}/u.test(plainText(body))
      if (!passages.length || (opens && passages.at(-1)?.locator !== start)) {
        passages.push({
          locator: start,
          headings: passages.length
            ? []
            : titleHeadings(titleLines[language], piece, language),
          division: piece.division,
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
  if (!intro) return { passages }
  const title = squash($(intro).children("h2").first().text()) || "Introduction"
  return {
    passages,
    intro: { title, html: blockHtml($, $(intro).children("p"), options) },
  }
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim()
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

/**
 * Wright's title: author, then work, in each language; a piece with one
 * line per language (Oration I) gives the work only, and one with no English
 * line (the Fragment) takes its heading.
 */
function titleHeadings(
  lines: string[],
  piece: JulianPiece,
  language: Side,
): Heading[] {
  const work = lines.at(-1) ?? (language === "en" ? piece.heading : undefined)
  if (!work) throw new Error(`${piece.heading}: no title`)
  const author = lines.length > 1 ? lines[0] : undefined
  return [
    ...(author
      ? [{ kind: "section" as const, html: author, editorial: false }]
      : []),
    { kind: author ? "subtitle" : "section", html: work, editorial: false },
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
