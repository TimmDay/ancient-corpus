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
import { importDio } from "./importers/dio.ts"
import { importEutropius } from "./importers/eutropius.ts"
import { importLacusCurtius } from "./importers/lacuscurtius.ts"
import { importPerseus, importPerseusLines } from "./importers/perseus.ts"
import { importTertullian } from "./importers/tertullian.ts"
import { importToposText, importToposTextLines } from "./importers/topostext.ts"
import { importSuetonius } from "./importers/suetonius.ts"
import { nameNotes } from "./note-ids.ts"

const IMPORTERS: Record<
  string,
  (source: EditionSource, work: Work, edition: Edition) => ImportedEdition
> = {
  dio: importDio,
  eutropius: importEutropius,
  lacuscurtius: (source, work, edition) =>
    importLacusCurtius(source, work.title, edition.language),
  perseus: importPerseus,
  "perseus-lines": importPerseusLines,
  suetonius: importSuetonius,
  tertullian: (source, work) => importTertullian(source, work.title),
  topostext: importToposText,
  "topostext-lines": importToposTextLines,
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

/** An Edition as its importer reads it, before any Correction, for tools that propose Corrections. */
export function importUncorrected(work: Work, edition: Edition): EditionText {
  const importer = IMPORTERS[edition.importer]
  if (!importer)
    throw new Error(
      `${work.slug}/${edition.slug}: no importer called "${edition.importer}"`,
    )
  return correctEdition(importer(edition.source, work, edition), [], {
    lines: work.numberedLines,
  })
}

export function importEdition(work: Work, edition: Edition): EditionText {
  const importer = IMPORTERS[edition.importer]
  if (!importer)
    throw new Error(
      `${work.slug}/${edition.slug}: no importer called "${edition.importer}"`,
    )
  const text = nameNotes(
    correctEdition(
      importer(edition.source, work, edition),
      readCorrections(work, edition),
      { lines: work.numberedLines },
    ),
    edition.slug,
  )
  mkdirSync(editionDir(work, edition), { recursive: true })
  writeEditionText(work, edition, text)
  return text
}
