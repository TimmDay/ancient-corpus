// pnpm build: renders the committed corpus into dist/ for Cloudflare Pages.
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
  homePage,
  notFoundPage,
  workPage,
} from "../src/site/render.ts"
import type { WorkListing } from "../src/works-index.ts"

const DIST = path.join(REPO_ROOT, "dist")

export function build(): { published: number; skipped: string[] } {
  rmSync(DIST, { recursive: true, force: true })
  mkdirSync(path.join(DIST, "assets"), { recursive: true })

  const published: { work: Work; edition: Edition }[] = []
  const listings: WorkListing[] = []
  const redirects: string[] = []
  const skipped: string[] = []

  for (const work of loadWorks()) {
    const editions = work.editions.filter((edition) => {
      if (!hasEditionText(work, edition)) return false
      const flags = unresolvedFlags(readEditionText(work, edition))
      if (flags.length)
        skipped.push(
          `${work.slug}/${edition.slug} (${flags.length} unresolved Flags)`,
        )
      return flags.length === 0
    })
    const preferred = editions.find((e) => e.preferred) ?? editions[0]
    if (!preferred) continue

    for (const edition of editions) {
      const html = workPage(
        work,
        edition,
        readEditionText(work, edition),
        editions,
      )
      write(path.join(work.slug, edition.slug, "index.html"), html)
      if (edition === preferred) write(path.join(work.slug, "index.html"), html)
    }
    published.push({ work, edition: preferred })
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

  write("index.html", homePage(published))
  write("cite/index.html", citePage())
  write("404.html", notFoundPage())
  write("works.json", JSON.stringify(listings))
  write("_redirects", redirects.join("\n") + "\n")
  cpSync(path.join(REPO_ROOT, "site"), path.join(DIST, "assets"), {
    recursive: true,
  })
  buildSync({
    entryPoints: ["reader", "cite", "home"].map((name) =>
      path.join(REPO_ROOT, "src", "client", `${name}.ts`),
    ),
    outdir: path.join(DIST, "assets"),
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    logLevel: "warning",
  })
  return { published: published.length, skipped }
}

function write(relative: string, content: string): void {
  const file = path.join(DIST, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

if (import.meta.main) {
  const { published, skipped } = build()
  console.log(`Built ${published} Works into dist/`)
  for (const s of skipped)
    console.warn(`NOT PUBLISHED: ${s}. Review them with pnpm review.`)
}
