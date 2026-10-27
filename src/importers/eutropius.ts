// Eutropius, Breviarium, ed. J. C. Hazzard (1898), Project Gutenberg #50808.
//
// A Latin school edition. Each book is an <h2> "LIBER …"; each chapter is a
// div.paragraph whose first div.line opens with span.chapnum "N."; Hazzard's
// English emperor headings are <h3>s between chapters. Footnotes are grammar
// references collected under FOOTNOTES. Preface, notes, vocabulary and the
// grammar index are Editorial matter.

import type { CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import type {
  Division,
  EditionSource,
  EditorialSection,
  Heading,
  ImportedEdition,
  Note,
  Passage,
} from "../corpus.ts"
import {
  blockHtml,
  inlineHtml,
  plainText,
  readIntakeHtml,
  romanToInt,
} from "./gutenberg.ts"
import { titleCase } from "./text.ts"

const EDITORIAL_TITLES: Record<string, string> = {
  PREFACE: "Preface",
  BIBLIOGRAPHY: "Bibliography",
  NOTES: "Notes",
  ABBREVIATIONS: "Abbreviations",
  VOCABULARY: "Vocabulary",
}

export function importEutropius(source: EditionSource): ImportedEdition {
  const $ = readIntakeHtml(source)
  const footnotes = readFootnotes($)
  const options = {
    noteRef: (el: Element) => footnoteId(el),
    drop: (el: Element) =>
      /\b(pagenum|linenum|chapnum)\b/.test(el.attribs.class ?? ""),
  }

  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  const editorial: EditorialSection[] = []

  for (const h2 of $("h2").toArray()) {
    const heading = $(h2).text().replace(/\s+/g, " ").trim()
    const bookAnchor = $(h2).find("a[id^=Liber_]").attr("id")
    const body = $(h2).nextUntil("h2")

    if (bookAnchor) {
      const book = String(romanToInt(bookAnchor.replace("Liber_", "")))
      const label = titleCase(heading)
      divisions.push({ locator: book, label })
      let pending: Heading[] = [
        { kind: "division", html: label, editorial: false },
      ]

      for (const el of body.toArray()) {
        const $el = $(el)
        if ($el.is("p.subheading")) {
          pending.push({
            kind: "subtitle",
            html: inlineHtml($, $el.contents(), options),
            editorial: true,
          })
        } else if ($el.is("h3")) {
          pending.push({
            kind: "section",
            html: inlineHtml($, $el.find("i").contents(), options),
            editorial: true,
          })
        } else if ($el.is("div.paragraph")) {
          const chapter = $el
            .find("span.chapnum")
            .first()
            .text()
            .replace(".", "")
            .trim()
          const html = $el
            .find("div.line")
            .toArray()
            .map((line) => inlineHtml($, $(line).contents(), options).trim())
            .join(" ")
          const current = passages.at(-1)
          if (chapter) {
            passages.push({
              locator: `${book}.${chapter}`,
              headings: pending,
              division: book,
              blocks: [html],
              notes: [],
              text: "",
            })
            pending = []
          } else if (current?.division === book) {
            current.blocks.push(html)
          } else {
            throw new Error(
              `Liber ${book}: text before the first chapter number`,
            )
          }
        }
      }
      continue
    }

    const title = Object.entries(EDITORIAL_TITLES).find(
      ([key]) => heading === key,
    )?.[1]
    const harkness = heading.startsWith("REFERENCES TO HARKNESS")
    if (title ?? harkness) {
      editorial.push({
        id: `ed-${editorial.length + 1}`,
        title: title ?? "References to Harkness’ New Latin Grammar",
        html: blockHtml($, body, options),
        notes: [],
      })
    }
  }

  for (const passage of passages) {
    passage.notes = notesFor(passage.blocks.join(" "), footnotes)
    passage.text = plainText(passage.blocks.join(" "))
  }
  for (const section of editorial)
    section.notes = notesFor(section.html, footnotes)

  return { divisions, passages, editorial }
}

function footnoteId(el: Element): string | undefined {
  const href = el.attribs.href ?? ""
  if (el.name === "a" && href.startsWith("#Footnote_"))
    return href.replace("#Footnote_", "")
  if (el.name === "a" && (el.attribs.id ?? "").startsWith("FNanchor_"))
    return ""
  return undefined
}

function readFootnotes($: CheerioAPI): Map<string, string> {
  const notes = new Map<string, string>()
  for (const p of $("div.footnote p").toArray()) {
    const id = $(p)
      .find("a[id^=Footnote_]")
      .attr("id")
      ?.replace("Footnote_", "")
    if (!id) continue
    const body = $(p)
      .contents()
      .filter(
        (_, node) =>
          !(
            node.type === "tag" &&
            (node.attribs.href ?? "").startsWith("#FNanchor_")
          ),
      )
      .filter(
        (_, node) =>
          !(
            node.type === "tag" &&
            (node.attribs.id ?? "").startsWith("Footnote_")
          ),
      )
    notes.set(id, inlineHtml($, body).trim())
  }
  return notes
}

/** The notes whose references appear in `html`, in reference order. */
export function notesFor(html: string, notes: Map<string, string>): Note[] {
  return [...html.matchAll(/id="r-([^"]+)"/g)].flatMap(([, id = ""]) => {
    const note = notes.get(id)
    return note === undefined ? [] : [{ id, html: note }]
  })
}
