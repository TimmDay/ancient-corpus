// Jerome, Chronicle, as Roger Pearse and friends published it on tertullian.org
// (2005): the English, and the Latin of Fotheringham's edition (1923) laid out
// the same way. Each language is one intake zip of three pages: the prefaces,
// and the chronicle in two parts.
//
// The chronicle is a facsimile of Jerome's double-page openings: each opening a
// <table> headed "[304/305]", the page numbers of Helm and Fotheringham. The
// left page's cells come before the AD column (class `annodomini`) in each row,
// the right page's after it. An entry opens with Helm's letter, `<em>a</em>`,
// and is cited by page and letter: 305a is a Passage. A cell without a letter
// carries on the entry before it, even across a page; a few English cells give
// the letter without italics ("b Theaetetus…"), read as a new entry only when
// it comes later in the alphabet than the page's last. Red or bold cells are
// Jerome's rubrics (reigns, Olympiads), kept as headings over the next entry;
// cells of numbers alone are the columns of regnal years, which are dropped,
// as are the translators' notes in the tables, which mostly give the Latin.
//
// The prefaces are paragraphs: Jerome's (praef.1, …) and the one he
// translated from Eusebius (eus.1, …), with Pearse's notes.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { load } from "cheerio"
import type { AnyNode, Element } from "domhandler"
import { unzipSync } from "fflate"
import {
  INTAKE_DIR,
  type Division,
  type EditionSource,
  type Heading,
  type ImportedEdition,
  type Passage,
} from "../corpus.ts"
import {
  escapeHtml,
  inlineHtml,
  notesFor,
  onlyArchive,
  plainText,
} from "./gutenberg.ts"

type Draft = Omit<Passage, "flags">

const options = {
  // Pearse's note markers in the tables: <span style="…top: -1ex…">1</span>.
  drop: (el: Element) => /top:\s*-1ex/.test(el.attribs.style ?? ""),
  // The preface's notes: <a href="#4"><sup>4</sup></a>.
  noteRef: (el: Element) =>
    el.name === "a" && /^#\d+$/.test(el.attribs.href ?? "")
      ? (el.attribs.href ?? "").slice(1)
      : undefined,
}

export function importJerome(source: EditionSource): ImportedEdition {
  const pages = readPages(onlyArchive(source))
  const page = (part: string) => {
    const name = [...pages.keys()].find((n) => n.includes(part))
    if (!name) throw new Error(`No ${part} page in the intake archive`)
    return pages.get(name) ?? ""
  }
  const divisions: Division[] = [{ locator: "praef", label: "Prefaces" }]
  const passages = prefaces(page("prefaces"))
  for (const [locator, part] of [
    ["1", "part1"],
    ["2", "part2"],
  ] as const) {
    const entries = chronicle(page(part), locator)
    const first = entries[0]?.locator.match(/^\d+/)?.[0]
    const last = entries.at(-1)?.locator.match(/^\d+/)?.[0]
    const label = `Pages ${first}–${last}`
    divisions.push({ locator, label })
    entries[0]?.headings.unshift({
      kind: "division",
      html: label,
      editorial: true,
    })
    passages.push(...entries)
  }
  return { divisions, passages, editorial: [] }
}

/** Jerome's preface and Eusebius's, a Passage a paragraph, with Pearse's notes. */
function prefaces(html: string): Draft[] {
  const $ = load(html)
  const paragraphs = $("p").toArray()
  const footnotes = paragraphs.findIndex(
    (p) => $(p).text().trim() === "Footnotes",
  )
  const notes = new Map<string, string>()
  for (const p of paragraphs.slice(footnotes + 1)) {
    const note = /^(\d+)\.\s*/.exec($(p).text().trim())
    if (note?.[1])
      notes.set(
        note[1],
        inlineHtml($, $(p).contents(), options)
          .trim()
          .replace(/^\d+\.\s*/, ""),
      )
  }
  const passages: Draft[] = []
  let prefix = "praef"
  let headings: Heading[] = [
    { kind: "division", html: "Prefaces", editorial: true },
    { kind: "section", html: "Preface of Jerome", editorial: true },
  ]
  // Jerome's text starts at his greeting; above it is the page's title.
  const start = paragraphs.findIndex((p) =>
    /^Eusebius Hieronymus/.test($(p).text().trim()),
  )
  for (const p of paragraphs.slice(start, footnotes)) {
    const html = inlineHtml($, $(p).contents(), options).trim()
    const text = plainText(html)
    if (!text) continue
    if (
      /Translated Preface of Eusebius|Eusebii interpretata praefatio/.test(text)
    ) {
      prefix = "eus"
      headings = [
        {
          kind: "section",
          html: html.replace(/\.?<sup.*$/, ""),
          editorial: false,
        },
      ]
      continue
    }
    const count = passages.filter((d) =>
      d.locator.startsWith(`${prefix}.`),
    ).length
    passages.push({
      locator: `${prefix}.${count + 1}`,
      headings,
      division: "praef",
      blocks: [html],
      notes: notesFor(html, notes),
      text,
    })
    headings = []
  }
  return passages
}

/** The entries of one part of the chronicle, opening by opening. */
function chronicle(html: string, division: string): Draft[] {
  const passages: Draft[] = []
  const byLocator = new Map<string, Draft>()
  let rubrics: Heading[] = []
  for (const opening of html.matchAll(
    /\[(\d+)\/(\d+)\]\s*(<table[\s\S]*?<\/table>)/g,
  )) {
    const [, left = "", right = "", table = ""] = opening
    const $ = load(table)
    const sides: [string, AnyNode[]][] = [
      [left, []],
      [right, []],
    ]
    for (const row of $("tr").toArray()) {
      const cells = $(row).children("td").toArray()
      if (cells.some((c) => /hdr_|tbl_shim/.test(c.attribs.class ?? "")))
        continue
      let side = 0
      for (const cell of cells) {
        if (/annodomini/.test(cell.attribs.class ?? "")) side = 1
        else sides[side]?.[1].push(cell)
      }
    }
    for (const [page, cells] of sides) {
      let lastLetter = ""
      for (const cell of cells) {
        const inner = $(cell).html() ?? ""
        const html = inlineHtml($, $(cell).contents(), options).trim()
        const text = plainText(html)
        if (!text || /^[\dIVXLC*\s.]+$/.test(text)) continue
        if (/<(strong|font)\b/i.test(inner)) {
          rubrics.push({
            kind: "section",
            html: escapeHtml(text),
            editorial: false,
          })
          continue
        }
        const italic = /^\s*<(?:em|i)>\s*([a-z]{1,2})\s*<\/(?:em|i)>\s*/.exec(
          html,
        )
        const plain = /^([a-z])\s+(?=[A-Z0-9("'‘“])/.exec(html)
        const letter =
          italic?.[1] ??
          (plain?.[1] && lastLetter && plain[1] > lastLetter
            ? plain[1]
            : undefined)
        if (letter) {
          const body = html.slice((italic ?? plain)?.[0].length ?? 0)
          const locator = `${page}${letter}`
          lastLetter = letter
          // A margin label ("3rd persecution") shares its entry's letter.
          const existing = byLocator.get(locator)
          if (existing) {
            existing.blocks.push(body)
            continue
          }
          const passage: Draft = {
            locator,
            headings: rubrics,
            division,
            blocks: [body],
            notes: [],
            text: "",
          }
          rubrics = []
          byLocator.set(locator, passage)
          passages.push(passage)
          continue
        }
        const previous = passages.at(-1)
        if (previous) previous.blocks.push(html)
        // Before the first entry: the opening rubric's black lines.
        else rubrics.push({ kind: "section", html, editorial: false })
      }
    }
  }
  for (const p of passages) p.text = plainText(p.blocks.join(" "))
  return passages
}

/** Every page from one unchanged intake zip, refusing a zip whose checksum moved. */
function readPages(intake: {
  file: string
  sha256: string
}): Map<string, string> {
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
      new TextDecoder("windows-1252").decode(bytes),
    ]),
  )
}
