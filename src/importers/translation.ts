// Our own translations (docs/adr/0003): written in translation.md beside the
// Edition's Passages, one "## <Locator>" heading per Passage, so the text is
// easy to review and correct as a file. There is no intake archive.

import { readFileSync } from "node:fs"
import path from "node:path"
import {
  editionDir,
  type Edition,
  type ImportedEdition,
  type Passage,
  type Work,
} from "../corpus.ts"
import { escapeHtml, plainText } from "./gutenberg.ts"

export function importTranslation(
  work: Work,
  edition: Edition,
): ImportedEdition {
  const file = path.join(editionDir(work, edition), "translation.md")
  return readTranslation(readFileSync(file, "utf8"))
}

export function readTranslation(markdown: string): ImportedEdition {
  const passages: Omit<Passage, "flags">[] = []
  for (const section of markdown.split(/^## /m).slice(1)) {
    const [heading = "", ...lines] = section.split("\n")
    const blocks = lines
      .join("\n")
      .split(/\n\s*\n/)
      .map((p) => p.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .map((p) => escapeHtml(p).replace(/\*([^*]+)\*/g, "<i>$1</i>"))
    passages.push({
      locator: heading.trim(),
      headings: [],
      division: "",
      blocks,
      notes: [],
      text: plainText(blocks.join(" ")),
    })
  }
  return { divisions: [], passages, editorial: [] }
}
