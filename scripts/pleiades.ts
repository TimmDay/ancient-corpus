// pnpm pleiades [YYYYMMDD]: refreshes the committed Pleiades snapshot
// (docs/adr/0005) from a dated Pleiades CSV dump, the newest by default.
// The dumps are intake: saved under data/intake/pleiades/<date>/, never
// committed, and recorded by URL and checksum in places/pleiades.source.json.

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { REPO_ROOT } from "../src/corpus.ts"
import {
  PLACES_DIR,
  PLEIADES_SNAPSHOT,
  PLEIADES_SOURCE,
  cutSnapshot,
  type SnapshotSource,
} from "../src/places.ts"

const DUMPS = "https://atlantides.org/downloads/pleiades/dumps/"
const FILES = ["places", "names"] as const
// A generic client name: no personal details go to outside services.
const HEADERS = { "User-Agent": "ancient-corpus-gazetteer/0.1" }
const LICENCE =
  "Pleiades, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/): Copyright © The Contributors and Creators"

/** The newest date for which every CSV we need has been published. */
async function newestDate(): Promise<string> {
  const listing = await (await fetch(DUMPS, { headers: HEADERS })).text()
  const dates = FILES.map(
    (file) =>
      new Set(
        [
          ...listing.matchAll(
            new RegExp(`pleiades-${file}-(\\d{8})\\.csv\\.gz`, "g"),
          ),
        ].map((m) => m[1]),
      ),
  )
  const both = [...(dates[0] ?? [])].filter((d) =>
    dates.every((set) => set.has(d)),
  )
  const newest = both.sort().at(-1)
  if (!newest) throw new Error(`No dated Pleiades dumps found at ${DUMPS}`)
  return newest
}

async function fetchDump(
  date: string,
  file: string,
): Promise<{ text: string; url: string; sha256: string }> {
  const name = `pleiades-${file}-${date}.csv.gz`
  const url = `${DUMPS}${name}`
  const local = path.join(REPO_ROOT, "data", "intake", "pleiades", date, name)
  if (!existsSync(local)) {
    const response = await fetch(url, { headers: HEADERS })
    if (!response.ok) throw new Error(`${url}: ${response.status}`)
    mkdirSync(path.dirname(local), { recursive: true })
    writeFileSync(local, Buffer.from(await response.arrayBuffer()))
  }
  const bytes = readFileSync(local)
  return {
    text: gunzipSync(bytes).toString("utf8"),
    url,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}

if (import.meta.main) {
  const date = process.argv[2] ?? (await newestDate())
  const [places, names] = await Promise.all(
    FILES.map((file) => fetchDump(date, file)),
  )
  if (!places || !names) throw new Error("A dump is missing")
  const snapshot = cutSnapshot(places.text, names.text)
  mkdirSync(PLACES_DIR, { recursive: true })
  writeFileSync(PLEIADES_SNAPSHOT, snapshot)
  const source: SnapshotSource = {
    date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`,
    files: [places, names].map(({ url, sha256 }) => ({ url, sha256 })),
    licence: LICENCE,
  }
  writeFileSync(PLEIADES_SOURCE, JSON.stringify(source, null, 2) + "\n")
  const count = snapshot.split("\n").filter(Boolean).length
  console.log(
    `Pleiades ${source.date}: ${count} Places, ${(snapshot.length / 1e6).toFixed(1)} MB`,
  )
}
