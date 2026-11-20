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
import { importBonnTei } from "./importers/bonn-tei.ts"
import { CEDRENUS, MALALAS, SYNCELLUS, importBonn } from "./importers/bonn.ts"
import { importChronography354 } from "./importers/chronography354.ts"
import { importCcel } from "./importers/ccel.ts"
import { importDfhg } from "./importers/dfhg.ts"
import { importDio } from "./importers/dio.ts"
import { importEutropius } from "./importers/eutropius.ts"
import { importDir } from "./importers/dir.ts"
import {
  LETTERS,
  MISOPOGON,
  ORATIONS,
  importJulian,
  importJulianCaesars,
} from "./importers/julian.ts"
import { importLacusCurtius } from "./importers/lacuscurtius.ts"
import { importLacusCurtiusVerse } from "./importers/lacuscurtius-verse.ts"
import {
  importLatinLibrary,
  importLatinLibrarySections,
} from "./importers/latinlibrary.ts"
import { importParthianSources } from "./importers/parthiansources.ts"
import {
  importPerseus,
  importPerseusLines,
  importPerseusParagraphs,
} from "./importers/perseus.ts"
import { importResGestae } from "./importers/res-gestae.ts"
import { importAmmianus, importAmmianusLatin } from "./importers/ammianus.ts"
import { importEpitomeLatin } from "./importers/epitome.ts"
import { importJerome } from "./importers/jerome.ts"
import { importTertullian } from "./importers/tertullian.ts"
import { importToposText, importToposTextLines } from "./importers/topostext.ts"
import {
  importTranscription,
  importTranslation,
} from "./importers/translation.ts"
import { importZonarasFoster } from "./importers/zonaras-foster.ts"
import { importSuetonius, importSuetoniusLatin } from "./importers/suetonius.ts"
import { nameNotes } from "./note-ids.ts"

const IMPORTERS: Record<
  string,
  (source: EditionSource, work: Work, edition: Edition) => ImportedEdition
> = {
  "chronicon-paschale": (source, _work, edition) =>
    importBonnTei(source, edition, { "1": "On Easter", "2": "Chronicle" }),
  bonn: (source, _work, edition) => importBonn(source, edition, CEDRENUS),
  "bonn-malalas": (source, _work, edition) =>
    importBonn(source, edition, MALALAS),
  "bonn-syncellus": (source, _work, edition) =>
    importBonn(source, edition, SYNCELLUS),
  "chronography-354": (source, _work, edition) =>
    importChronography354(source, edition),
  ccel: (source, work) => importCcel(source, work.title),
  dfhg: (source, work) => importDfhg(source, work.title),
  dio: importDio,
  dir: importDir,
  eutropius: importEutropius,
  "julian-caesars": importJulianCaesars,
  "julian-orations": (source, _work, edition) =>
    importJulian(source, edition, ORATIONS),
  "julian-misopogon": (source, _work, edition) =>
    importJulian(source, edition, MISOPOGON),
  "julian-letters": (source, _work, edition) =>
    importJulian(source, edition, LETTERS),
  lacuscurtius: (source, work, edition) =>
    importLacusCurtius(source, work.title, edition.language),
  "lacuscurtius-verse": (source, work, edition) =>
    importLacusCurtiusVerse(source, work.title, edition.language),
  latinlibrary: (source) => importLatinLibrary(source),
  "latinlibrary-sections": (source) => importLatinLibrarySections(source),
  parthiansources: (source, _work, edition) =>
    importParthianSources(source, edition),
  perseus: importPerseus,
  "res-gestae": (source, _work, edition) =>
    importResGestae(source, edition.language),
  "perseus-lines": importPerseusLines,
  "perseus-paragraphs": importPerseusParagraphs,
  suetonius: importSuetonius,
  "suetonius-latin": (source) => importSuetoniusLatin(source),
  ammianus: (source) => importAmmianus(source),
  "ammianus-latin": (source) => importAmmianusLatin(source),
  "epitome-latin": (source) => importEpitomeLatin(source),
  jerome: (source) => importJerome(source),
  tertullian: (source, work) => importTertullian(source, work.title),
  topostext: importToposText,
  "topostext-lines": importToposTextLines,
  transcription: (_source, work, edition) => importTranscription(work, edition),
  translation: (_source, work, edition) => importTranslation(work, edition),
  "zonaras-foster": importZonarasFoster,
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
