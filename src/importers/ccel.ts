// Translations from the Christian Classics Ethereal Library (ccel.org), one
// whole volume of the Ante-Nicene or Nicene and Post-Nicene Fathers in ThML
// in an intake zip. A Work is one <div2> of the volume, or (Eusebius) a run
// of <div2 type="Book">; its chapters are <div3>. Passages are chapters, a
// paragraph to each printed paragraph, section numbers kept as printed; a
// section Locator such as `7.30.19` lands on its chapter. The translator's
// footnotes and endnotes (<note>) become the chapter's notes, numbered from 1
// in each chapter; print page breaks are dropped.

import type { CheerioAPI } from "cheerio"
import type { AnyNode, Element } from "domhandler"
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
  onlyArchive,
  plainText,
  romanToInt,
} from "./gutenberg.ts"
import { readTei } from "./perseus.ts"

type Layout =
  /** The Work is this one <div2>, its chapters titled "Chap. I". */
  | { div2: string }
  /**
   * The Work is every <div2 type="Book"> under this <div1>; `appendixAfter`
   * names chapters followed, inside the same <div3>, by a titled appendix
   * that the original numbers on its own.
   */
  | { booksIn: string; appendixAfter: string[] }

const LAYOUTS: Record<string, Layout> = {
  "De Mortibus Persecutorum": { div2: "iii.v" },
  "Historia Ecclesiastica": { booksIn: "iii", appendixAfter: ["8.17"] },
}

export function importCcel(
  source: EditionSource,
  work: string,
): ImportedEdition {
  const layout = LAYOUTS[work]
  if (!layout) throw new Error(`No CCEL layout for ${work}`)
  const $ = readTei(onlyArchive(source))
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []

  if ("div2" in layout) {
    const root = $(`div2[id="${layout.div2}"]`)
    if (!root.length) throw new Error(`No <div2 id="${layout.div2}">`)
    const editorial: EditorialSection[] = []
    for (const chapter of root.children("div3").toArray()) {
      const title = chapter.attribs.title ?? ""
      const number = /^Chap\. ([IVXLC]+)/.exec(title)?.[1]
      // The American editor's "Elucidation" after the last chapter.
      if (!number) {
        editorial.push({
          id: `editorial-${editorial.length + 1}`,
          title,
          html: blockHtml($, $(chapter).children().not("h4"), {
            noteRef: (el) => (el.name === "note" ? "" : undefined),
          }),
          notes: [],
        })
        continue
      }
      passages.push(
        ...chapterPassages(
          $,
          chapter,
          String(romanToInt(number)),
          "",
          [],
          false,
        ),
      )
    }
    return { divisions, passages, editorial }
  }

  for (const book of $(`div1[id="${layout.booksIn}"]`)
    .children('div2[type="Book"]')
    .toArray()) {
    const n = String(romanToInt(book.attribs.n ?? ""))
    const label = `Book ${n}`
    divisions.push({ locator: n, label })
    $(book)
      .children("div3")
      .each((i, chapter) => {
        const division: Heading[] =
          i === 0 ? [{ kind: "division", html: label, editorial: false }] : []
        // A book's introduction is its preface, `7.praef` as in the Greek.
        const number =
          chapter.attribs.type === "Chapter"
            ? String(romanToInt(chapter.attribs.n ?? ""))
            : "praef"
        const locator = `${n}.${number}`
        passages.push(
          ...chapterPassages(
            $,
            chapter,
            locator,
            n,
            division,
            layout.appendixAfter.includes(locator),
          ),
        )
      })
  }
  return { divisions, passages, editorial: [] }
}

/**
 * One chapter's Passages: usually one. With `appendix`, the second title in
 * the chapter (the appendix printed after Eusebius 8.17) starts a second
 * Passage, as the Greek numbers it: `8.appendix`. Any other title inside a
 * chapter heads a quoted letter or decree, and stays in the text in italics.
 */
function chapterPassages(
  $: CheerioAPI,
  chapter: Element,
  locator: string,
  division: string,
  divisionHeadings: Heading[],
  appendix: boolean,
): Omit<Passage, "flags">[] {
  const parts: Omit<Passage, "flags">[] = []
  let current: Omit<Passage, "flags"> | undefined
  const number = locator.split(".").at(-1) ?? locator
  let count = 0
  const notes = new Map<string, Note>()
  const options = (keepNotes: boolean) => ({
    // Each <note> becomes a reference here and a note of the Passage. A
    // chapter title's notes are dropped: headings carry no references.
    noteRef: (el: Element) => {
      if (el.name !== "note") return undefined
      if (!keepNotes) return ""
      count += 1
      const id = `${locator}-${count}`
      notes.set(id, { id, label: `${number}.${count}`, html: noteHtml($, el) })
      return id
    },
  })
  const all = $(chapter)
    .find("p")
    .toArray()
    .filter(
      (p) =>
        !$(p).parents("note").length && !/note/i.test(p.attribs.class ?? ""),
    )
  const isTitle = (p: Element) => p.attribs.class === "c47"
  // What comes before the chapter's title is the book's own title page.
  const first = all.findIndex(isTitle)
  const paragraphs = first > 0 ? all.slice(first) : all
  for (const p of paragraphs) {
    const title = isTitle(p)
    if (title && current?.blocks.length) {
      if (!appendix || parts.length > 1) {
        const html = inlineHtml($, $(p).contents(), options(false)).trim()
        if (html) current.blocks.push(`<i>${html.replace(/<\/?i>/g, "")}</i>`)
        continue
      }
      parts.push(newPart(`${division}.appendix`, division, []))
      current = parts.at(-1)
    } else if (!current) {
      parts.push(newPart(locator, division, [...divisionHeadings]))
      current = parts.at(-1)
    }
    const html = inlineHtml($, $(p).contents(), options(!title))
      .replace(/\s+([,.;:])/g, "$1")
      .trim()
    if (!html || !current) continue
    if (title) {
      current.headings.push({ kind: "section", html, editorial: false })
    } else {
      current.blocks.push(html)
    }
  }
  for (const part of parts) {
    part.notes = [...part.blocks.join(" ").matchAll(/id="r-([^"]+)"/g)].flatMap(
      ([, id = ""]) => notes.get(id) ?? [],
    )
    part.text = plainText(part.blocks.join(" "))
  }
  return parts.filter((part) => part.blocks.length)
}

function newPart(
  locator: string,
  division: string,
  headings: Heading[],
): Omit<Passage, "flags"> {
  return { locator, headings, division, blocks: [], notes: [], text: "" }
}

/** A note's text; the American editor's own notes keep the brackets he printed. */
function noteHtml($: CheerioAPI, note: AnyNode): string {
  const paragraphs = $(note).children("p")
  const html =
    paragraphs.length > 1
      ? blockHtml($, $(note).contents())
      : inlineHtml($, (paragraphs.length ? paragraphs : $(note)).contents())
  return html.trim()
}
