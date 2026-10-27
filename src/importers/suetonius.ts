// Suetonius, De Vita Caesarum, tr. Alexander Thomson, rev. T. Forester,
// Project Gutenberg #6400.
//
// Each Life is an <h2>; chapters are not elements, only a Roman numeral ("I.",
// "XCII.") opening a <p>. The volume also holds the Lives of the Grammarians,
// Rhetoricians and Poets, which are separate Works and not imported here.
// Translator's essays appended to some Lives arrive inside their last
// chapter; the length Flag catches them for review.

import type { CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import type {
  Division,
  EditionSource,
  EditorialSection,
  ImportedEdition,
  Passage,
} from "../corpus.ts"
import { notesFor } from "./eutropius.ts"
import {
  blockHtml,
  inlineHtml,
  plainText,
  readIntakeHtml,
  romanToInt,
} from "./gutenberg.ts"

/** The twelve Lives in the order they appear, by their canonical Locator names. */
const LIVES = [
  "Julius",
  "Augustus",
  "Tiberius",
  "Caligula",
  "Claudius",
  "Nero",
  "Galba",
  "Otho",
  "Vitellius",
  "Vespasian",
  "Titus",
  "Domitian",
]

const CHAPTER_MARKER = /^([IVXLCDM]+)\.\s+/
/** Print page numbers left in the text, e.g. "married (2) Cornelia" or "(20) XXIX. Roused". */
const PAGE_MARKER = /(^|\s)\(\d{1,4}\)(?=[\s<]|$)/g

export function importSuetonius(source: EditionSource): ImportedEdition {
  const $ = readIntakeHtml(source)
  const notes = readNotes($)
  const options = {
    noteRef: (el: Element) => {
      const href = el.attribs.href ?? ""
      return el.name === "a" && href.startsWith("#linknote-")
        ? href.replace("#linknote-", "")
        : undefined
    },
  }

  const headings = $("h2").toArray()
  const first = headings.findIndex((h) => /^\s*CAIUS JULIUS/.test($(h).text()))
  if (first === -1) throw new Error("No <h2> for the Life of Julius")

  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []

  LIVES.forEach((life, i) => {
    const h2 = headings[first + i]
    if (!h2) throw new Error(`No <h2> for the Life of ${life}`)
    divisions.push({ locator: life, label: life })
    const heading = { kind: "division" as const, html: life, editorial: false }
    let expected = 1

    for (const p of $(h2).nextUntil("h2").filter("p").toArray()) {
      const html = inlineHtml($, $(p).contents(), options)
        .replace(PAGE_MARKER, "$1")
        .trim()
      if (!plainText(html)) continue
      const marker = CHAPTER_MARKER.exec(html)
      const numeral = marker?.[1] ?? ""
      const value = numeral ? romanToInt(numeral) : undefined
      // A lone I, V, X, L, C, D or M followed by a full stop is just as often
      // a praenomen ("M. Agrippa"), so it opens a chapter only when it is the
      // next number due.
      const opens =
        value !== undefined && (numeral.length > 1 || value === expected)
      const current = passages.at(-1)

      if (opens && marker) {
        passages.push({
          locator: `${life} ${value}`,
          headings: value === 1 || current?.division !== life ? [heading] : [],
          division: life,
          blocks: [html.slice(marker[0].length)],
          notes: [],
          text: "",
        })
        expected = value + 1
      } else if (current?.division === life) {
        current.blocks.push(html)
      }
      // Paragraphs before a Life's first chapter are its heading's subtitle; dropped.
    }
  })

  for (const passage of passages) {
    passage.notes = notesFor(passage.blocks.join(" "), notes)
    passage.text = plainText(passage.blocks.join(" "))
  }

  const preface = headings.find((h) => $(h).text().trim() === "PREFACE")
  const editorial: EditorialSection[] = preface
    ? [
        {
          id: "ed-1",
          title: "Translator’s preface",
          html: blockHtml($, $(preface).nextUntil("h2"), options),
          notes: [],
        },
      ]
    : []
  for (const section of editorial) section.notes = notesFor(section.html, notes)

  return { divisions, passages, editorial }
}

/** Notes sit at the end, each an empty anchor `linknote-N` followed by a p.foot. */
function readNotes($: CheerioAPI): Map<string, string> {
  const notes = new Map<string, string>()
  for (const anchor of $("a[id^=linknote-]").toArray()) {
    const id = anchor.attribs.id?.replace("linknote-", "") ?? ""
    const foot = $(anchor).closest("p").nextAll("p.foot").first()
    const body = foot
      .contents()
      .filter((_, node) => !(node.type === "tag" && node.name === "a"))
    const html = inlineHtml($, body)
      .replace(/^\s*\d+\s*\(\s*\)\s*/, "")
      .trim()
      .replace(/^\[\s*([\s\S]*?)\s*\]$/, "$1")
    notes.set(id, html)
  }
  return notes
}
