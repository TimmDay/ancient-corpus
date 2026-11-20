// Bible books in USFM, as eBible.org publishes them (one zip per translation,
// a .usfm file per book). `\c 3` opens a chapter, `\v 10` a verse, `\p` and
// `\q` paragraphs and verse lines, `\s` a section heading. A Passage is a
// chapter, named by its number, a paragraph to each `\p`; a verse Locator such
// as `1.10` lands on its chapter. Verse numbers are not printed. The
// translator's added words (`\add … \add*`) print in italics, as the King
// James tradition prints them; footnotes and cross-references are dropped.

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

/** The book's USFM code in eBible's file names, by Work title. */
const BOOKS: Record<string, string> = {
  "1 Maccabees": "1MA",
  "2 Maccabees": "2MA",
}

export function importUsfm(
  source: EditionSource,
  work: string,
): ImportedEdition {
  const code = BOOKS[work]
  if (!code) throw new Error(`No USFM book for ${work}`)
  const usfm = readBook(onlyArchive(source), code)
  const passages: Omit<Passage, "flags">[] = []
  let headings: Heading[] = []
  let paragraph: string[] = []
  const chapter = () => passages.at(-1)
  const close = () => {
    const html = paragraph.join(" ").replace(/\s+/g, " ").trim()
    if (html) chapter()?.blocks.push(html)
    paragraph = []
  }
  for (const line of usfm.split(/\r?\n/)) {
    const [, marker = "", rest = ""] = /^\\(\w+\*?)\s*(.*)$/.exec(line) ?? [
      "",
      "",
      line,
    ]
    if (marker === "c") {
      close()
      passages.push({
        locator: rest.trim(),
        headings,
        division: "",
        blocks: [],
        notes: [],
        text: "",
      })
      headings = []
      continue
    }
    if (/^s\d?$/.test(marker)) {
      close()
      const html = inline(rest)
      if (html) headings.push({ kind: "section", html, editorial: true })
      continue
    }
    if (/^(p|m|pi\d?|q\d?|li\d?|b|nb)$/.test(marker)) {
      close()
      if (rest) paragraph.push(inline(rest))
      continue
    }
    if (marker === "v") {
      paragraph.push(inline(rest.replace(/^\S+\s*/, "")))
      continue
    }
    // Book titles, running heads and other front matter.
    if (marker && !chapter()) continue
    if (!marker && chapter()) paragraph.push(inline(line))
  }
  close()
  for (const p of passages) p.text = plainText(p.blocks.join(" "))
  return { divisions: [], passages, editorial: [] }
}

/** A line's text: added words in italics; notes, cross-references and other markers dropped. */
function inline(text: string): string {
  return escapeHtml(
    text.replace(/\\f\s.*?\\f\*/g, "").replace(/\\x\s.*?\\x\*/g, ""),
  )
    .replace(/\\add\s*(.*?)\\add\*/g, "<i>$1</i>")
    .replace(/\\\+?\w+\*?/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function readBook(
  intake: { file: string; sha256: string },
  code: string,
): string {
  const archive = readFileSync(path.join(INTAKE_DIR, intake.file))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== intake.sha256)
    throw new Error(
      `${intake.file}: checksum ${sha256} does not match the manifest's ${intake.sha256}`,
    )
  const files = unzipSync(new Uint8Array(archive), {
    filter: (f) => new RegExp(`-${code}[^/]*\\.usfm$`).test(f.name),
  })
  const [name, ...others] = Object.keys(files)
  if (!name || others.length)
    throw new Error(`${intake.file}: expected one ${code} book`)
  return new TextDecoder().decode(files[name]).replace(/^\uFEFF/, "")
}
