import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadWorks } from "../src/corpus.ts"
import { build } from "./build.ts"

const unpublished = loadWorks().flatMap((w) =>
  w.editions
    .filter((e) => e.unpublished)
    .map((e) => ({ work: w.slug, edition: e.slug })),
)

// Builds from the committed works/, exactly as CI and Cloudflare do, into a
// scratch folder so a running dev server's dist/ is left alone.
describe("build", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "corpus-build-"))
  const result = build({ outDir })
  const read = (file: string) => readFileSync(path.join(outDir, file), "utf8")

  it("publishes Editions with no unresolved Flags and holds back the rest", () => {
    expect(result.published).toBeGreaterThanOrEqual(1)
    expect(
      result.skipped
        .filter(
          (s) =>
            !unpublished.some((u) => s.startsWith(`${u.work}/${u.edition}`)),
        )
        .every((s) => s.includes("unresolved Flags")),
    ).toBe(true)
  })

  it("never publishes an Edition waiting for permission", () => {
    // Its text is gitignored, so only a machine that imported it has any to leak.
    for (const { work, edition } of unpublished) {
      expect(existsSync(path.join(outDir, work, edition))).toBe(false)
      const workPage = path.join(work, "index.html")
      if (existsSync(path.join(outDir, workPage)))
        expect(read(workPage)).not.toContain(`/${work}/${edition}/`)
    }
  })

  it("gives every Passage an anchor and the page its Locator index", () => {
    const page = read("eutropius/breviarium/index.html")
    expect(page).toContain('<section class="passage" id="9.9"')
    expect(page).toContain('id="locator-index"')
    expect(page).toContain('lang="la"')
  })

  it("reads a long Edition a book at a time, from one link", () => {
    const draftsDir = mkdtempSync(path.join(tmpdir(), "corpus-drafts-"))
    build({ drafts: true, outDir: draftsDir })
    const readDraft = (file: string) =>
      readFileSync(path.join(draftsDir, file), "utf8")
    const book = readDraft("cassius-dio/roman-history/44/index.html")
    expect(book).toContain('<section class="passage" id="44.19"')
    expect(book).not.toContain('id="45.1"')
    // The Work's own page knows which book holds every Locator.
    expect(readDraft("cassius-dio/roman-history/index.html")).toContain(
      '"locator":"44.19","id":"44.19","page":"/cassius-dio/roman-history/44/"',
    )
    expect(readDraft("cassius-dio/roman-history/80/index.html")).toContain(
      'id="80.1(Alexander)"',
    )
  })

  it("redirects long slugs, keeping the rest of the path", () => {
    expect(read("_redirects")).toContain(
      "/eutropius/breviarium-historiae-romanae/* /eutropius/breviarium/:splat 301",
    )
  })
})
