// Fragments from the Digital Fragmenta Historicorum Graecorum (dfhg-project.org),
// Monica Berti's digital edition of Karl Müller's FHG (1841–72): one author's
// records from its API (`api.php?author=…`), saved as one JSON file in an
// intake zip. Each record is one excerpt, with Müller's work, fragment number,
// the source it is quoted from ("Syncellus p. 376, A:"), the text, and his
// critical notes.
//
// A Work takes the records of one of the author's works; a Passage is a
// fragment, `16a`, its excerpts a paragraph each under the sources they come
// from. Müller's numbered markers for his notes ("(3)", "(*)") are dropped,
// and the notes become one note to the fragment; his lacunae ("***", "..")
// and bracketed deletions stay as printed. The text is Greek, or Latin where
// Müller quotes a Latin writer citing the author.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { unzipSync } from "fflate"
import {
  INTAKE_DIR,
  type EditionSource,
  type Heading,
  type ImportedEdition,
  type Passage,
} from "../corpus.ts"
import { escapeHtml, onlyArchive, plainText } from "./gutenberg.ts"

type DfhgRecord = {
  work: string
  fragment_number: string
  fragment_letter: string
  witness: string
  text: string
  commentary: string
}

/** Müller's heading for each Work, as the API spells it. */
const WORKS: Record<string, string> = {
  Scythica: "ΣΚΥΘΙΚΑ",
  // Müller's heading begins with a Latin X and P.
  Chronica: "XPONIKA",
}

export function importDfhg(
  source: EditionSource,
  work: string,
): ImportedEdition {
  const heading = WORKS[work]
  if (!heading) throw new Error(`No DFHG work for ${work}`)
  const records = readRecords(onlyArchive(source)).filter(
    (r) => r.work === heading && r.fragment_number.trim(),
  )
  const byFragment = Map.groupBy(
    records,
    (r) => `${r.fragment_number.trim()}${r.fragment_letter.trim()}`,
  )
  const passages: Omit<Passage, "flags">[] = [...byFragment].map(
    ([locator, excerpts]) => {
      const headings: Heading[] = []
      const blocks = excerpts.map((r, i) => {
        // Where the excerpt is quoted from, as Müller heads it.
        const from = `<i>${escapeHtml(r.witness.trim().replace(/:$/, ""))}</i>`
        if (i === 0)
          headings.push({ kind: "subtitle", html: from, editorial: true })
        return `${i === 0 ? "" : `${from}: `}${escapeHtml(clean(r.text))}`
      })
      const notes = excerpts
        .map((r) => clean(r.commentary))
        .filter(Boolean)
        .map((html, i) => ({
          id: `${locator}-${i + 1}`,
          label: `${locator}.${i + 1}`,
          html: escapeHtml(html),
        }))
      return {
        locator,
        headings,
        division: "",
        blocks,
        notes,
        text: plainText(blocks.join(" ")),
      }
    },
  )
  return { divisions: [], passages, editorial: [] }
}

function clean(text: string): string {
  return (
    text
      .normalize("NFC")
      // An elision mark the digitisation keeps as a space and a combining comma.
      .replace(/ ?\u0313(?=[\s\]]|$)/g, "’")
      .replace(/\s*\((?:\d+|\*)\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
  )
}

function readRecords(intake: { file: string; sha256: string }): DfhgRecord[] {
  const archive = readFileSync(path.join(INTAKE_DIR, intake.file))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== intake.sha256)
    throw new Error(
      `${intake.file}: checksum ${sha256} does not match the manifest's ${intake.sha256}`,
    )
  const files = unzipSync(new Uint8Array(archive), {
    filter: (f) => f.name.endsWith(".json"),
  })
  const [name, ...others] = Object.keys(files)
  if (!name || others.length)
    throw new Error(`${intake.file}: expected one JSON file`)
  return JSON.parse(new TextDecoder().decode(files[name])) as DfhgRecord[]
}
