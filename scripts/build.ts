// pnpm build: renders the committed corpus into dist/ for Cloudflare.
// Reads only files in Git (works/), never data/intake/, so CI can run it.

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { buildSync } from "esbuild"
import {
  REPO_ROOT,
  hasEditionText,
  loadWorks,
  readEditionText,
  unresolvedFlags,
  type Edition,
  type Work,
} from "../src/corpus.ts"
import {
  citePage,
  editionsPage,
  homePage,
  howToUsePage,
  notFoundPage,
  workPages,
} from "../src/site/render.ts"
import { catalogueEntries } from "../src/catalogue.ts"
import { readPlaceReferences } from "../src/place-references.ts"
import {
  placePath,
  pleiadesUrl,
  readPlaces,
  type PlaceId,
} from "../src/places.ts"
import type { WorkListing } from "../src/works-index.ts"

const DIST = path.join(REPO_ROOT, "dist")

/**
 * Editions with unresolved Flags are published, each flagged Passage marked.
 * `drafts` also renders unpublished Editions, bannered, for local use only.
 */
export function build({ drafts = false, outDir = DIST } = {}): {
  published: number
  skipped: string[]
} {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(path.join(outDir, "assets"), { recursive: true })
  const write = (relative: string, content: string) => {
    const file = path.join(outDir, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, content)
  }

  const published: { work: Work; edition: Edition; flagged: number }[] = []
  const indexRows: Parameters<typeof editionsPage>[0] = []
  const entries = catalogueEntries()
  const listings: WorkListing[] = []
  const redirects: string[] = []
  const skipped: string[] = []
  const referenced = new Set<PlaceId>()

  for (const work of loadWorks()) {
    const editions = work.editions.filter((edition) => {
      if (!hasEditionText(work, edition)) return false
      if (edition.unpublished) {
        skipped.push(`${work.slug}/${edition.slug} (${edition.unpublished})`)
        return drafts
      }
      return true
    })
    // The Index lists Editions waiting for permission too, from work.json
    // alone, since their text is never committed.
    for (const edition of work.editions)
      if (edition.unpublished || editions.includes(edition))
        indexRows.push({ work, edition, entry: entries.get(work.slug) })
    const preferred = editions.find((e) => e.preferred) ?? editions[0]
    if (!preferred) continue

    const texts = new Map(
      editions.map((e) => [e.slug, readEditionText(work, e)]),
    )
    const locatorsOf = new Map(
      [...texts].map(([slug, text]) => [
        slug,
        [...new Set(text.passages.map((p) => p.locator))],
      ]),
    )
    for (const edition of editions) {
      for (const reference of readPlaceReferences(work, edition, () =>
        readPlaces(),
      ))
        for (const id of [reference.place, ...(reference.candidates ?? [])])
          if (id) referenced.add(id)
      const text = texts.get(edition.slug) ?? readEditionText(work, edition)
      const pages = workPages(work, edition, text, editions, locatorsOf)
      for (const [page, html] of pages) {
        write(path.join(work.slug, edition.slug, page, "index.html"), html)
        if (edition === preferred)
          write(path.join(work.slug, page, "index.html"), html)
      }
    }
    published.push({
      work,
      edition: preferred,
      flagged: new Set(
        unresolvedFlags(readEditionText(work, preferred)).map((f) => f.locator),
      ).size,
    })
    listings.push({
      slug: work.slug,
      author: work.author,
      title: work.title,
      otherTitles: work.otherTitles,
      editions: editions.map((e) => e.slug),
      preferredEdition: preferred.slug,
    })
    for (const alias of work.slugAliases) {
      redirects.push(
        `/${alias} /${work.slug}/ 301`,
        `/${alias}/* /${work.slug}/:splat 301`,
      )
    }
  }

  // One small file per Place a published Edition refers to, fetched when its
  // popover opens; never the whole snapshot.
  for (const id of referenced) {
    const place = readPlaces().get(id)
    if (!place) continue
    const { title, types, precision, point, bbox, extent } = place
    write(
      `places/${placePath(id)}.json`,
      JSON.stringify({
        id,
        title,
        types,
        precision,
        point,
        bbox,
        extent,
        uri: pleiadesUrl(id),
      }),
    )
  }

  write("index.html", homePage(published))
  write("cite/index.html", citePage())
  write("how-to-use/index.html", howToUsePage())
  write("editions/index.html", editionsPage(indexRows))
  write("404.html", notFoundPage())
  write("works.json", JSON.stringify(listings))
  write("_redirects", redirects.join("\n") + "\n")
  cpSync(path.join(REPO_ROOT, "site"), path.join(outDir, "assets"), {
    recursive: true,
  })
  // MapLibre finds its worker beside itself through import.meta.url, which a
  // bundle would rewrite, so its ES modules are served as published and
  // imported only when a Place popover first opens.
  const maplibre = path.join(REPO_ROOT, "node_modules", "maplibre-gl", "dist")
  for (const file of [
    "maplibre-gl.mjs",
    "maplibre-gl-shared.mjs",
    "maplibre-gl-worker.mjs",
    "maplibre-gl.css",
  ])
    cpSync(
      path.join(maplibre, file),
      path.join(outDir, "assets", "maplibre", file),
    )
  buildSync({
    entryPoints: ["reader", "cite", "home", "editions", "site"].map((name) =>
      path.join(REPO_ROOT, "src", "client", `${name}.ts`),
    ),
    outdir: path.join(outDir, "assets"),
    bundle: true,
    minify: true,
    // Pages load several bundles as classic scripts; each needs its own scope.
    format: "iife",
    target: "es2022",
    logLevel: "warning",
  })
  return { published: published.length, skipped }
}

if (import.meta.main) {
  const { published, skipped } = build()
  console.log(`Built ${published} Works into dist/`)
  for (const s of skipped) console.warn(`NOT PUBLISHED: ${s}`)
}
