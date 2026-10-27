// Runs an Edition's importer over its intake archive, applies its Corrections,
// and writes the result as the committed Passage files.

import { existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import {
  editionDir,
  writeEditionText,
  type Edition,
  type EditionSource,
  type EditionText,
  type ImportedEdition,
  type Work,
} from "./corpus.ts"
import { correctEdition, type Correction } from "./corrections.ts"
import { importEutropius } from "./importers/eutropius.ts"
import { importSuetonius } from "./importers/suetonius.ts"

const IMPORTERS: Record<string, (source: EditionSource) => ImportedEdition> = {
  eutropius: importEutropius,
  suetonius: importSuetonius,
}

export function correctionsFile(work: Work, edition: Edition): string {
  return path.join(editionDir(work, edition), "corrections.json")
}

export function readCorrections(work: Work, edition: Edition): Correction[] {
  const file = correctionsFile(work, edition)
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Correction[])
    : []
}

export function importEdition(work: Work, edition: Edition): EditionText {
  const importer = IMPORTERS[edition.importer]
  if (!importer)
    throw new Error(
      `${work.slug}/${edition.slug}: no importer called "${edition.importer}"`,
    )
  const text = correctEdition(
    importer(edition.source),
    readCorrections(work, edition),
  )
  mkdirSync(editionDir(work, edition), { recursive: true })
  writeEditionText(work, edition, text)
  return text
}
