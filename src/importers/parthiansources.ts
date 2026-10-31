// Shapur I's inscription (ŠKZ) from Parthian Sources Online, saved page by
// page into one intake zip: one page per chapter, numbered as in Huyse's
// edition of the Parthian (1999). Each page gives Huyse's transliteration and
// transcription, then Jake Nabel's English inside "[expand]…[/expand]".
// The Parthian Edition takes the transcription; the English Edition, Nabel's
// translation.

import type { CheerioAPI } from "cheerio"
import type {
  Edition,
  EditionSource,
  ImportedEdition,
  Passage,
} from "../corpus.ts"
import { inlineHtml, onlyArchive, plainText } from "./gutenberg.ts"
import { readIntakePages } from "./lacuscurtius.ts"

const CHAPTERS = 51

export function importParthianSources(
  source: EditionSource,
  edition: Edition,
): ImportedEdition {
  const pages = readIntakePages(onlyArchive(source))
  const passages: Omit<Passage, "flags">[] = []
  for (let chapter = 1; chapter <= CHAPTERS; chapter++) {
    const $ = pages.get(`pages/skz-${chapter}.html`)
    if (!$)
      throw new Error(`pages/skz-${chapter}.html is not in the intake archive`)
    const html =
      edition.language === "en" ? translation($) : transcription($, chapter)
    passages.push({
      locator: String(chapter),
      headings: [],
      division: "",
      blocks: [html],
      notes: [],
      text: plainText(html),
    })
  }
  return { divisions: [], passages, editorial: [] }
}

/**
 * The text after the "Transcription" heading, up to the translation: in the
 * heading's own paragraph after a line break on some pages, in the paragraphs
 * after it on others.
 */
function transcription($: CheerioAPI, chapter: number): string {
  const heading = $(".entry-content p")
    .filter(
      (_, el) =>
        $(el).children("strong").first().text().trim() === "Transcription",
    )
    .first()
  const own = heading.clone()
  own.children("strong").first().remove()
  const parts = [inlineHtml($, own.contents()).trim()]
  for (
    let p = heading.next("p");
    p.length && !p.text().includes("[expand");
    p = p.next("p")
  )
    parts.push(inlineHtml($, p.contents()).trim())
  const text = parts.filter(Boolean).join(" ")
  if (!text) throw new Error(`Chapter ${chapter} has no transcription`)
  return text
}

/** Nabel's English, between "[expand title=…Translation…]" and "[/expand]". */
function translation($: CheerioAPI): string {
  const p = $(".entry-content p").filter((_, el) =>
    $(el).text().includes("[expand"),
  )
  return inlineHtml($, p.contents())
    .replace(/^\s*\[expand[^\]]*\]/, "")
    .replace(/\[\/expand\][\s\S]*$/, "")
    .trim()
}
