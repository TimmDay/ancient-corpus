// A Bonn Corpus edition as Open Greek and Latin transcribed it (First1KGreek
// TEI), where the Greek and the Bonn editor's Latin translation follow each
// other on every printed page: the Chronicon Paschale (Dindorf, 1832).
//
// A Passage is a printed page, cited by its number (`508`), as scholars cite
// the Bonn edition. The pages fall into the TEI's chapters, which become
// Divisions: the treatise on Easter (1) and the chronicle (2). The Greek
// Edition takes a page's Greek paragraphs, the Latin one its Latin ones,
// told apart by their script. A paragraph that runs across a page break is
// cut there. The page's apparatus (<note type="footnote">) goes with the
// Greek; the margins (sigla, the Paris pages, years) and the corrigenda are
// dropped. Where the transcription marks a sign it could not encode,
// <foreign xml:lang="abbr">ABBREV</foreign>, it is left out.

import type { CheerioAPI } from "cheerio"
import type { AnyNode, Element } from "domhandler"
import type {
  Division,
  Edition,
  EditionSource,
  Heading,
  ImportedEdition,
  Note,
  Passage,
} from "../corpus.ts"
import { escapeHtml, onlyArchive, plainText } from "./gutenberg.ts"
import { readTei } from "./perseus.ts"

type Page = {
  n: string
  division: string
  headings: Heading[]
  blocks: string[]
  notes: string[]
}

export function importBonnTei(
  source: EditionSource,
  edition: Edition,
  labels: Record<string, string>,
): ImportedEdition {
  const $ = readTei(onlyArchive(source))
  const pages = readPages($, labels)
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  for (const page of pages) {
    const blocks = page.blocks.filter(
      (block) => scriptOf(block) === edition.language,
    )
    if (!blocks.length) continue
    if (!divisions.some((d) => d.locator === page.division))
      divisions.push({
        locator: page.division,
        label: labels[page.division] ?? page.division,
      })
    const notes: Note[] =
      edition.language === "grc"
        ? page.notes.map((html, i) => ({
            id: `${page.n}-${i + 1}`,
            label: `${page.n}.${i + 1}`,
            html,
          }))
        : []
    passages.push({
      locator: page.n,
      headings: passages.some((p) => p.division === page.division)
        ? page.headings
        : [
            {
              kind: "division",
              html: escapeHtml(labels[page.division] ?? page.division),
              editorial: true,
            },
            ...page.headings,
          ],
      division: page.division,
      blocks,
      notes,
      text: plainText(blocks.join(" ").replace(/<br>/g, " ")),
    })
  }
  return { divisions, passages, editorial: [] }
}

/** Every printed page of the labelled chapters, its paragraphs in both languages. */
function readPages($: CheerioAPI, labels: Record<string, string>): Page[] {
  const pages: Page[] = []
  for (const chapter of $('div[subtype="chapter"]').toArray()) {
    const division = $(chapter).attr("n") ?? ""
    if (!(division in labels)) continue
    let page: Page | undefined
    let open: string[] | undefined
    const flush = () => {
      if (open && page) {
        const block = clean(open.join(""))
        if (block) page.blocks.push(block)
      }
      open = undefined
    }
    const turn = (n: string) => {
      page = { n, division, headings: [], blocks: [], notes: [] }
      pages.push(page)
    }
    const walk = (nodes: AnyNode[]) => {
      for (const node of nodes) {
        if (node.type === "text") {
          open?.push(escapeHtml(node.data))
          continue
        }
        if (node.type !== "tag") continue
        const el = node as Element
        switch (el.name) {
          case "pb": {
            // A paragraph running over the page is cut at the break.
            const running = open !== undefined
            flush()
            turn(el.attribs.n ?? "")
            if (running) open = []
            break
          }
          case "note": {
            // A few footnotes are never closed (pages 378 and 571), so the
            // parser hangs the following pages inside them: read on from
            // the first paragraph or page break as text.
            const rest = el.children.findIndex(
              (c) => c.type === "tag" && /^(p|pb|lg|head)$/.test(c.name),
            )
            const own = rest < 0 ? el.children : el.children.slice(0, rest)
            if (el.attribs.type === "footnote" && page)
              page.notes.push(clean(text(own)))
            if (rest >= 0) walk(el.children.slice(rest))
            break
          }
          case "head":
            if (page)
              page.headings.push({
                kind: "section",
                html: clean(text(el.children)),
                editorial: false,
              })
            break
          case "p":
          case "lg":
            flush()
            open = []
            walk(el.children)
            flush()
            break
          case "l":
            if (open?.length) open.push("<br>")
            walk(el.children)
            break
          case "lb":
            open?.push(el.attribs.n ? " " : "<br>")
            break
          case "foreign":
            if (el.attribs["xml:lang"] !== "abbr") walk(el.children)
            break
          default:
            walk(el.children)
        }
      }
    }
    walk(chapter.children)
    flush()
  }
  return pages
}

/** An element's words, with its markup left out. */
function text(nodes: AnyNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.data)
      if (node.type !== "tag") return ""
      const el = node as Element
      if (el.name === "lb") return " "
      if (el.name === "foreign" && el.attribs["xml:lang"] === "abbr") return ""
      return text(el.children)
    })
    .join("")
}

/** Collapses whitespace, rejoins hyphenated words, and normalizes to NFC. */
function clean(html: string): string {
  return html
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/(\p{L})- (?=\p{Ll})/gu, "$1")
    .replace(/^(?:<br>|\s)+|(?:<br>|\s)+$/g, "")
    .trim()
}

function scriptOf(block: string): string {
  const greek = (block.match(/[Ͱ-Ͽἀ-῿]/g) ?? []).length
  const latin = (block.match(/[A-Za-z]/g) ?? []).length
  return greek > latin ? "grc" : "la"
}
