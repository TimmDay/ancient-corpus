// pnpm ingest <author/title> [edition]: re-imports Editions from data/intake/.
// With no arguments, re-imports every Edition whose intake archive is present.

import { existsSync } from "node:fs"
import path from "node:path"
import { INTAKE_DIR, loadWorks, unresolvedFlags } from "../src/corpus.ts"
import { importEdition } from "../src/importing.ts"

const [workSlug, editionSlug] = process.argv.slice(2)
const works = loadWorks().filter((w) => !workSlug || w.slug === workSlug)
if (workSlug && !works.length) throw new Error(`No Work ${workSlug}`)

for (const work of works) {
  for (const edition of work.editions) {
    if (editionSlug && edition.slug !== editionSlug) continue
    const missing = edition.source.archives.filter(
      (a) => !existsSync(path.join(INTAKE_DIR, a.file)),
    )
    if (missing.length) {
      console.warn(
        `skip ${work.slug}/${edition.slug}: not in data/intake/: ${missing.map((a) => a.file).join(", ")}`,
      )
      continue
    }
    const text = importEdition(work, edition)
    const flags = unresolvedFlags(text)
    console.log(
      `${work.slug}/${edition.slug}: ${text.passages.length} Passages, ${text.editorial.length} editorial sections, ` +
        `${flags.length} unresolved Flags`,
    )
    for (const { locator, flag } of flags)
      console.log(`  ${flag.code.padEnd(4)} ${locator}: ${flag.detail}`)
  }
}
