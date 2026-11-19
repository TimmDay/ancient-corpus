// The Chronography of 354, as Roger Pearse published it on tertullian.org
// (2006): Mommsen's Latin (MGH Chronica Minora 1, 1892) and Pearse's English
// side by side, a table row per entry, the Latin in a row's first cell
// (class tbl_middle, or tbl_middle_hdr for a heading) and the English in its
// second. One saved page per part;
// so far the Chronicle of the City of Rome.
//
// A heading row in capitals ("ITEM IMPERIA CAESARVM") starts a Division:
// the kings of Latium, of Alba and of Rome, the dictators, the Caesars. An
// entry is named by its ruler, in italics at its start, so a Passage's
// Locator is its Division and the ruler, `caesares.aurelianus`; an entry
// without one (the list of dictators) is numbered. The folio numbers in
// the margin and the "||" of the manuscript's line breaks are dropped. The
// denarius sign, an X struck through, is printed as 𐆖.

import { load } from "cheerio"
import type { Element } from "domhandler"
import type {
  Division,
  Edition,
  EditionSource,
  ImportedEdition,
  Passage,
} from "../corpus.ts"
import {
  escapeHtml,
  onlyArchive,
  plainText,
  readIntakeHtml,
} from "./gutenberg.ts"

/** Each heading of the Chronicle, as a Division's Locator and label. */
const DIVISIONS: [RegExp, string, string][] = [
  [/ORIGO GENTIS/, "origo", "The origin of the Roman people"],
  [/REGES ALBANI/, "alba", "Kings of Alba"],
  [/REGES ROMANORVM/, "reges", "Kings of the Romans"],
  [/DICTATORVM/, "dictatores", "The dictators"],
  [/IMPERIA CAESARVM/, "caesares", "The rule of the Caesars"],
]

export function importChronography354(
  source: EditionSource,
  edition: Edition,
): ImportedEdition {
  const $ = readIntakeHtml(onlyArchive(source))
  const column = edition.language === "la" ? 0 : 1
  const divisions: Division[] = []
  const passages: Omit<Passage, "flags">[] = []
  let division = ""
  for (const row of $("tr").toArray() as Element[]) {
    const cells = $(row).children("td.tbl_middle, td.tbl_middle_hdr").toArray()
    if (cells.length !== 2) continue
    const latin = $(cells[0]).text().replace(/\s+/g, " ").trim()
    const heading = DIVISIONS.find(([pattern]) => pattern.test(latin))
    if (heading) {
      const [, locator, label] = heading
      division = locator
      divisions.push({ locator, label })
      continue
    }
    if (!division) continue
    const cell = $(cells[column])
    cell.find(".td_strikethrough").replaceWith("𐆖")
    const name = $(cells[0]).children("i").first().text()
    const html = escapeHtml(
      cell.text().replace(/\|\|/g, " ").replace(/\s+/g, " ").trim(),
    )
    const inDivision = passages.filter((p) => p.division === division).length
    const locator = `${division}.${name ? slug(name) : String(inDivision + 1)}`
    const label = divisions.find((d) => d.locator === division)?.label ?? ""
    passages.push({
      locator,
      headings: inDivision
        ? []
        : [{ kind: "division", html: escapeHtml(label), editorial: true }],
      division,
      blocks: [html],
      notes: [],
      text: plainText(html),
    })
  }
  return { divisions, passages, editorial: [] }
}

/** "Divus Octavianus Augustus" → "divus-octavianus-augustus". */
function slug(name: string): string {
  return load(`<p>${name}</p>`)
    .text()
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "")
}
