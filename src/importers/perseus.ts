// Greek and Latin texts in the TEI EpiDoc of the Perseus Digital Library and
// Open Greek and Latin (First1KGreek), one XML file in an intake zip. Books,
// chapters and sections are <div type="textpart" subtype="…" n="…">. Passages
// are chapters, a paragraph to each section; a section Locator such as
// `1.18.2` lands on its chapter. The
// editor's additions (<add>) print in angle brackets ⟨…⟩ and deletions (<del>)
// in square brackets, as in the printed edition; print page breaks are dropped.

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
    divisions.push({ locator: n, label: `Book ${n}` })
    $(book)
      .children('div[subtype="chapter"]')
      .each((i, chapter) => {
        // A paragraph per section, as the edition's sections fall.
        const blocks = $(chapter)
          .find("p")
          .toArray()
          .map((p) => inline($, p.children).replace(/\s+/g, " ").trim())
          .filter(Boolean)
        passages.push({
          locator: `${n}.${$(chapter).attr("n") ?? ""}`,
          headings:
            i === 0
              ? [{ kind: "division", html: `Book ${n}`, editorial: false }]
              : [],
          division: n,
          blocks,
          notes: [],
          text: plainText(blocks.join(" ")),
        })
      })
  }
  return { divisions, passages, editorial: [] }
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
          return "<br>"
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
