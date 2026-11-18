// Epitome de Caesaribus, the Latin from The Latin Library: one page, a
// paragraph a chapter opening <B>35</B>, its sections numbered inline,
// "1 Aurelianus … 2 Iste …". A Passage is a section, 35.2, as in Banchich's
// English. A number is read as a section only if it is the next one, or a
// little past it (a skipped number) or a repeat (a slip, corrected after).

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { load } from "cheerio"
import { unzipSync } from "fflate"
import {
  INTAKE_DIR,
  type EditionSource,
  type ImportedEdition,
  type Passage,
} from "../corpus.ts"
import { escapeHtml, onlyArchive } from "./gutenberg.ts"

export function importEpitomeLatin(source: EditionSource): ImportedEdition {
  const html = readPage(onlyArchive(source))
  const passages: Omit<Passage, "flags">[] = []
  let lastChapter = 0
  let chapter = ""
  let section = 0
  for (const [, inner = ""] of html.matchAll(/<p>\s*([\s\S]*?)<\/p>/gi)) {
    // A chapter opens <B>35</B>; its later paragraphs carry on without one.
    const head = /^<b>\s*(\d+)\s*<\/b>/i.exec(inner)
    if (head?.[1]) {
      // The page prints Otho as a second chapter 6 and skips 10; a number
      // at or below the last chapter's is read as the next.
      const printed = Number(head[1])
      chapter = String(printed <= lastChapter ? lastChapter + 1 : printed)
      lastChapter = Number(chapter)
      section = 0
    } else if (!chapter) continue
    const text = load(`<p>${inner.slice(head?.[0].length ?? 0)}</p>`)
      .text()
      .replace(/\s+/g, " ")
      .trim()
    let start = 0
    const push = (end: number) => {
      const body = text.slice(start, end).trim()
      if (!body) return
      const last = passages.at(-1)
      // Text before this paragraph's first number continues the section before.
      if (start === 0 && last && !/^\d/.test(text)) {
        last.blocks.push(escapeHtml(body))
        last.text += ` ${body}`
        return
      }
      passages.push({
        locator: `${chapter}.${section}`,
        headings: [],
        division: "",
        blocks: [escapeHtml(body)],
        notes: [],
        text: body,
      })
    }
    let first = true
    for (const m of text.matchAll(/(?:^|\s)(\d{1,2})\s(?=\S)/g)) {
      const n = Number(m[1])
      if (n < section || n > section + 3) continue
      if (!first || m.index > 0) push(m.index)
      first = false
      section = n
      start = m.index + m[0].length
    }
    push(text.length)
  }
  return { divisions: [], passages, editorial: [] }
}

function readPage(intake: { file: string; sha256: string }): string {
  const archive = readFileSync(path.join(INTAKE_DIR, intake.file))
  const sha256 = createHash("sha256").update(archive).digest("hex")
  if (sha256 !== intake.sha256)
    throw new Error(
      `${intake.file}: checksum ${sha256} does not match the manifest's ${intake.sha256}`,
    )
  const files = unzipSync(new Uint8Array(archive), {
    filter: (f) => f.name.endsWith(".html"),
  })
  const [name] = Object.keys(files)
  if (!name) throw new Error(`${intake.file}: no HTML page`)
  return new TextDecoder().decode(files[name])
}
