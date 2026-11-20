// The Res Gestae Divi Augusti, ed. and tr. Frederick W. Shipley (Loeb, 1924),
// transcribed by Bill Thayer on LacusCurtius: six pages, each a table whose
// rows are chapters, the Latin, the Greek version and the English side by side
// (td.Latin, td.Greek, td.English). The English cell opens each chapter with
// <a class="chapter" name="12">, or `S1` to `S4` for the summary appended to
// the inscription; the first row holds the inscription's heading, and the
// second goes on with chapter 1. A Passage is a chapter, the same Locators in
// all three Editions.
//
// The letters Shipley restores are <span class="emend">, printed here in
// italics as in the Loeb. The English takes Shipley's explanatory notes
// (#noteN); the Latin and Greek take his critical notes (#cnoteN). Notes
// restart on every page, so they are numbered on through the Edition. Thayer's
// own notes and the margin numbers of sections and inscription lines are
// dropped.

import type { CheerioAPI } from "cheerio"
import type { Element } from "domhandler"
import type {
  EditionSource,
  Heading,
  ImportedEdition,
  Passage,
} from "../corpus.ts"
import { inlineHtml, notesFor, onlyArchive, plainText } from "./gutenberg.ts"
import { readIntakePages } from "./lacuscurtius.ts"

type Draft = Omit<Passage, "flags">

const PAGES = ["1*", "2*", "3*", "4*", "5*", "6*"]
const CELL: Record<string, string> = {
  la: "td.Latin",
  grc: "td.Greek",
  en: "td.English",
}

export function importResGestae(
  source: EditionSource,
  language: string,
): ImportedEdition {
  const cell = CELL[language]
  if (!cell) throw new Error(`No Res Gestae column for ${language}`)
  const pages = readIntakePages(onlyArchive(source))
  const passages: Draft[] = []
  let label = 0
  for (const page of PAGES) {
    const file = `pages/E/Roman/Texts/Augustus/Res_Gestae/${page}.html`
    const $ = pages.get(file)
    if (!$) throw new Error(`${file} is not in the intake archive`)
    $("span.emend").each((_, el) => {
      el.name = "i"
    })
    // An inscription's line number set inside a word (`legi<a>11</a> timís`)
    // is followed by a space that is not in the text.
    $("td.Latin a.sec, td.Greek a.sec").each((_, el) => {
      const before = el.prev
      const after = el.next
      if (
        before?.type === "text" &&
        /\S$/.test(before.data) &&
        after?.type === "text" &&
        /^\s/.test(after.data)
      )
        after.data = after.data.replace(/^\s+/, "")
    })
    const kind = language === "en" ? "note" : "cnote"
    const ids = new Map<string, string>()
    const idFor = (n: string) => {
      let id = ids.get(n)
      if (!id) ids.set(n, (id = String(++label)))
      return id
    }
    const options = {
      noteRef: (el: Element) => {
        const target = /#(c?note)(\d+)\s*$/.exec(el.attribs.href ?? "")
        return el.name === "a" &&
          /\bref\b/.test(el.attribs.class ?? "") &&
          target?.[1] === kind
          ? idFor(target[2] ?? "")
          : undefined
      },
      // Margin numbers (the Greek's are `Greek_chapter`), Thayer's
      // corrections, and links to the other kind of note.
      drop: (el: Element) =>
        /(\b|_)(sec|chapter|pagenum|correction)\b/.test(
          el.attribs.class ?? "",
        ) ||
        (/\bref\b/.test(el.attribs.class ?? "") &&
          !new RegExp(`#${kind}\\d+\\s*$`).test(el.attribs.href ?? "")) ||
        (el.name === "a" && $(el).find("img").length > 0),
    }
    const notes = readNotes($, kind, idFor)
    let pending: Heading[] = [
      { kind: "section", html: partOf($), editorial: false },
    ]
    for (const row of $("tr").toArray()) {
      const english = $(row).children("td.English")
      if (!english.length) continue
      const chapter = english.find("a.chapter").first().attr("name")
      const blocks = blocksOf($, $(row).children(cell), options)
      if (/^S1$/.test(chapter ?? ""))
        pending.push({ kind: "section", html: "Summary", editorial: false })
      if (!chapter) {
        const previous = passages.at(-1)
        if (!previous) throw new Error(`${page}: a row before any chapter`)
        previous.blocks.push(...blocks)
        continue
      }
      passages.push({
        locator: chapter,
        headings: pending,
        division: "",
        blocks,
        notes: [],
        text: "",
      })
      pending = []
    }
    for (const p of passages)
      if (!p.text) {
        p.notes = notesFor(p.blocks.join(" "), notes).map((n) => ({
          ...n,
          label: n.id,
        }))
        // A restoration can begin inside a word: its italics are not a break.
        p.text = plainText(p.blocks.join(" ").replace(/<\/?i>/g, ""))
      }
  }
  return { divisions: [], passages, editorial: [] }
}

/** The page's own heading, "Part III". */
function partOf($: CheerioAPI): string {
  return $("h1")
    .first()
    .clone()
    .find(".pagenum")
    .remove()
    .end()
    .text()
    .replace(/[\s⁠]+/g, " ")
    .replace(/\s*[a-z]$/, "")
    .trim()
}

/** A cell's paragraphs, or its whole text where it has none. */
function blocksOf(
  $: CheerioAPI,
  cell: ReturnType<CheerioAPI>,
  options: Parameters<typeof inlineHtml>[2],
): string[] {
  const paragraphs = cell.find("p").toArray()
  const parts = paragraphs.length ? paragraphs : cell.toArray()
  return parts
    .map((p) =>
      inlineHtml($, $(p).contents(), options)
        .replace(/[­⁠]/g, "")
        .replace(/\s*§\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((html) => plainText(html))
}

/** Shipley's notes of one kind on a page, each opened by <a class="note" id="note3">. */
function readNotes(
  $: CheerioAPI,
  kind: string,
  idFor: (n: string) => string,
): Map<string, string> {
  const notes = new Map<string, string>()
  for (const anchor of $("a.note").toArray()) {
    const match = new RegExp(`^${kind}(\\d+)$`).exec(anchor.attribs.id ?? "")
    if (!match?.[1]) continue
    const parts = []
    for (let node = anchor.next; node; node = node.next) {
      if (node.type === "tag" && /\bnote\b/.test(node.attribs.class ?? ""))
        break
      parts.push(node)
    }
    const html = inlineHtml($, $(parts))
      .replace(/[­⁠]/g, "")
      .replace(/\s+/g, " ")
      .trim()
    notes.set(idFor(match[1]), html)
  }
  return notes
}
