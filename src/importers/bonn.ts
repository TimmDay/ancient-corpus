// Texts of the Bonn Corpus Scriptorum Historiae Byzantinae, which prints the
// Greek and a Latin translation on the same page, from archive.org's own OCR
// of its scans: per volume, the OCR text (hocr_searchtext.txt, one OCR block
// per line), where each scanned leaf starts in it (hocr_pageindex.json), and
// archive.org's reading of each leaf's printed page number (page_numbers.json).
//
// A Passage is a printed page, cited by volume and page (Cedrenus `1.451`),
// or by page alone in a one-volume Work (Malalas `299`), whose Divisions are
// then its books, from the page each starts on.
// A leaf gets its page from archive.org's confident reading, or by counting
// on from the nearest such leaf when the leaves between agree; a leaf neither
// gives (a plate, a blank, a misread number) is left out, and the gap Flag
// says where. The Greek Edition takes a page's Greek blocks, the Latin one
// its Latin blocks. The running heads, the printed line numbers and the
// margin's letters and Paris (or Oxford) page numbers are dropped, and so is
// the apparatus under the Greek where a Work's layout says how to spot it.
// The OCR is otherwise uncorrected.

import { readFileSync } from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { unzipSync } from "fflate"
import {
  INTAKE_DIR,
  type Division,
  type Edition,
  type EditionSource,
  type ImportedEdition,
  type Passage,
} from "../corpus.ts"
import { escapeHtml, onlyArchive, plainText, romanToInt } from "./gutenberg.ts"

type PageNumbers = {
  pages: { leafNum: number; pageNumber: string; confidence: number }[]
}

/** What differs between the Bonn volumes this importer reads. */
export type BonnLayout = {
  /** A running head, "450 GEORGII CEDRENI": its words, without the number. */
  head: RegExp
  /** A line to drop wherever it falls: a gathering's signature. */
  drop?: RegExp
  /** Where the apparatus starts, when the OCR runs it on from the page's Greek: cut there. */
  apparatus?: RegExp
  /** More in the outer margin to drop from the Greek, such as another edition's pages. */
  margin?: RegExp
  /** A one-volume Work cited by page: the page each book starts on, and the text's last page. */
  books?: { starts: Record<string, number>; last: number }
}

export const CEDRENUS: BonnLayout = {
  head: /CEDRENI|COMPENDIUM/i,
  drop: /^\s*Georg\.?\s*Cedrenus\s*\(?t?om/i,
}

export const MALALAS: BonnLayout = {
  head: /MALALAE|CHRONOGRAPH/i,
  // The apparatus: a line number, "10. ", then readings that cite the earlier
  // editions, Chilmead (Ch.) and Oxford (Ox.), or the Chronicon Paschale.
  apparatus: /(?:^|\s)\d{1,2}\.\s(?=.*\b(?:Ch|Ox|Chron)[.,])[\s\S]*$/,
  // The Oxford and Venice editions' pages, "O 397", "V 199", and the accents
  // of the line above read as a run of stray marks: "- € ^ *."
  margin: /(^|\s)(?:[OV]\s?\d{1,3}|[-–€^*,.:;'"|!?()\\/]+)(?=\s|$)/g,
  // From the books' headings. Book 1's opening is lost: Dindorf prints in
  // its place an anonymous chronicle (pages 1 to 22, "Anonymi chronologica").
  books: {
    starts: {
      I: 1,
      II: 23,
      III: 57,
      IV: 68,
      V: 91,
      VI: 150,
      VII: 171,
      VIII: 192,
      IX: 214,
      X: 227,
      XI: 269,
      XII: 283,
      XIII: 316,
      XIV: 351,
      XV: 377,
      XVI: 392,
      XVII: 410,
      XVIII: 425,
    },
    last: 496,
  },
}

/** archive.org's page-number reading counts only at or above this confidence. */
const CONFIDENT = 50

export function importBonn(
  source: EditionSource,
  edition: Edition,
  layout: BonnLayout,
): ImportedEdition {
  const files = readArchive(onlyArchive(source))
  const volumes = [
    ...new Set(Object.keys(files).map((name) => name.split("/")[0] ?? "")),
  ].sort()
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  for (const volume of volumes) {
    const read = (file: string) => {
      const bytes = files[`${volume}/${file}`]
      if (!bytes) throw new Error(`${volume}/${file} is not in the archive`)
      return new TextDecoder().decode(bytes)
    }
    const numbers = JSON.parse(read("page_numbers.json")) as PageNumbers
    const index = JSON.parse(read("hocr_pageindex.json")) as number[][]
    const text = read("hocr_searchtext.txt")
    const n = volume.replace(/^vol/, "")
    if (!layout.books) divisions.push({ locator: n, label: `Volume ${n}` })
    const leafText = (leaf: number) => {
      const [start = 0, end = 0] = index[leaf - 1] ?? []
      return text.slice(start, end).split("\n")
    }
    const pages = pagesOfLeaves(numbers)
    const firstBlock = (leaf: number) => leafText(leaf)[0] ?? ""
    const shift = runningHeadShift(pages, firstBlock, layout.head)
    for (const [leaf, numbered] of pages) {
      const page = numbered + shift
      // A leaf before the text proper, once shifted.
      if (page < 1) continue
      const book = layout.books && bookOf(page, layout.books)
      if (layout.books && !book) continue
      const blocks = leafText(leaf)
        .filter((block, i) => !(i === 0 && isRunningHead(block, layout.head)))
        .filter((block) => !layout.drop?.test(block))
        .map((block) =>
          layout.apparatus ? block.replace(layout.apparatus, "") : block,
        )
        .flatMap(splitScripts)
        .filter((block) => scriptOf(block) === edition.language)
        .map((block) => clean(block, edition.language, layout.margin))
        .filter((block) => (block.match(/\p{L}/gu) ?? []).length >= 4)
      if (!blocks.length) continue
      const division = book ?? n
      const label = book ? `Book ${romanToInt(book)}` : `Volume ${n}`
      if (book && !divisions.some((d) => d.locator === book))
        divisions.push({ locator: book, label })
      passages.push({
        locator: book ? String(page) : `${n}.${page}`,
        headings: passages.some((p) => p.division === division)
          ? []
          : [{ kind: "division", html: label, editorial: false }],
        division,
        blocks,
        notes: [],
        text: plainText(blocks.join(" ")),
      })
    }
  }
  return { divisions, passages, editorial: [] }
}

/**
 * Each leaf's printed page: archive.org's confident reading, or counted on
 * from the confident leaf before it when the next confident leaf agrees.
 */
export function pagesOfLeaves(numbers: PageNumbers): Map<number, number> {
  const anchors = numbers.pages
    .filter((p) => /^\d+$/.test(p.pageNumber) && p.confidence >= CONFIDENT)
    .map((p) => ({ leaf: p.leafNum, page: Number(p.pageNumber) }))
  const pages = new Map<number, number>()
  anchors.forEach((a, i) => {
    pages.set(a.leaf, a.page)
    const b = anchors[i + 1]
    if (b && b.page - a.page === b.leaf - a.leaf)
      for (let leaf = a.leaf + 1; leaf < b.leaf; leaf++)
        pages.set(leaf, a.page + (leaf - a.leaf))
  })
  // A page read twice (a misread number) keeps its first leaf.
  const seen = new Set<number>()
  return new Map(
    [...pages]
      .sort(([a], [b]) => a - b)
      .filter(([, page]) => !seen.has(page) && seen.add(page)),
  )
}

/** "450 GEORGII CEDRENI" or "HISTORIARUM COMPENDIUM. 451", however the OCR spells the rest. */
function isRunningHead(block: string, head: RegExp): boolean {
  return block.length < 45 && head.test(block)
}

/** The page number a running head prints, at either end, if legible. */
function headNumber(block: string, head: RegExp): number | undefined {
  if (!isRunningHead(block, head)) return undefined
  const match = /^\s*(\d{1,3})\s|\D(\d{1,3})\s*$/.exec(block)
  const n = Number(match?.[1] ?? match?.[2])
  return Number.isInteger(n) ? n : undefined
}

/**
 * How far archive.org's page numbers are out from the running heads: the
 * difference most legible heads agree on, when most of them do (one scan's
 * numbers run a page high throughout). Misread heads disagree at random.
 */
function runningHeadShift(
  pages: Map<number, number>,
  firstBlock: (leaf: number) => string,
  head: RegExp,
): number {
  const differences = new Map<number, number>()
  let legible = 0
  for (const [leaf, page] of pages) {
    const printed = headNumber(firstBlock(leaf), head)
    if (printed === undefined) continue
    legible++
    differences.set(printed - page, (differences.get(printed - page) ?? 0) + 1)
  }
  const [shift = 0, count = 0] =
    [...differences].sort(([, a], [, b]) => b - a)[0] ?? []
  return count > legible / 2 ? shift : 0
}

/** The book a page is in: the last to start on or before it, a page with a book's heading taking the new book. */
function bookOf(
  page: number,
  books: { starts: Record<string, number>; last: number },
): string | undefined {
  if (page > books.last) return undefined
  return Object.entries(books.starts)
    .filter(([, start]) => start <= page)
    .sort(([, a], [, b]) => b - a)[0]?.[0]
}

/**
 * A block the OCR ran together from the Greek and the Latin below it, cut
 * at the word where the Latin begins: the cut that leaves the most Greek
 * words before it and Latin words after. A block in one script is kept whole.
 */
export function splitScripts(block: string): string[] {
  const words = block.split(" ")
  const greek = words.map((w) => scriptOf(w) === "grc" && /\p{L}/u.test(w))
  const latin = words.map(
    (w, i) => !greek[i] && (w.match(/[A-Za-z]/g) ?? []).length >= 2,
  )
  const greekWords = greek.filter(Boolean).length
  const latinWords = latin.filter(Boolean).length
  if (greekWords < 8 || latinWords < 8) return [block]
  let best = { cut: 0, score: -1 }
  let greekBefore = 0
  let latinAfter = latinWords
  for (let cut = 0; cut <= words.length; cut++) {
    if (greekBefore + latinAfter > best.score)
      best = { cut, score: greekBefore + latinAfter }
    if (greek[cut]) greekBefore++
    if (latin[cut]) latinAfter--
  }
  return [
    words.slice(0, best.cut).join(" "),
    words.slice(best.cut).join(" "),
  ].filter((part) => part.trim())
}

/** "grc" when a block is mostly Greek letters, else "la". */
function scriptOf(block: string): string {
  const greek = (block.match(/[Ͱ-Ͽἀ-῿]/g) ?? []).length
  const latin = (block.match(/[A-Za-z]/g) ?? []).length
  return greek > latin ? "grc" : "la"
}

function clean(block: string, language: string, margin?: RegExp): string {
  let text = block.normalize("NFC")
  if (margin && language === "grc") text = text.replace(margin, "$1")
  if (language === "grc")
    text = text
      // Line numbers in the inner margin, every fifth line.
      .replace(/(^|\s)(?:5|10|15|20|25|30|35)(?=\s)/g, "$1")
      // The outer margin: section letters and the Paris edition's pages.
      .replace(/(^|\s)P\s?\d{1,3}(?=\s)/g, "$1")
      .replace(/(^|\s)[A-D](?=\s)/g, "$1")
      // A decorated capital read as an extra rough breathing.
      .replace(/Ἱ(?=\p{Lu})/gu, "")
      // The printer's θ, and καί read in Latin letters, throughout.
      .replace(/ϑ/g, "θ")
      .replace(/(^|\s)xal(?=[\s,.;·])/g, "$1καὶ")
  return escapeHtml(
    text
      .replace(/\s+/g, " ")
      .replace(/(\p{L})- (?=\p{Ll})/gu, "$1")
      .trim(),
  )
}

function readArchive(intake: {
  file: string
  sha256: string
}): Record<string, Uint8Array> {
  const archive = readFileSync(path.join(INTAKE_DIR, intake.file))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== intake.sha256)
    throw new Error(
      `${intake.file}: checksum ${sha256} does not match the manifest's ${intake.sha256}`,
    )
  return unzipSync(new Uint8Array(archive))
}
