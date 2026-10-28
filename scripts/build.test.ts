import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { build } from "./build.ts"

// Builds from the committed works/, exactly as CI and Cloudflare do, into a
// scratch folder so a running dev server's dist/ is left alone.
describe("build", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "corpus-build-"))
  const result = build({ outDir })
  const read = (file: string) => readFileSync(path.join(outDir, file), "utf8")

  it("publishes Editions with no unresolved Flags and holds back the rest", () => {
    expect(result.published).toBeGreaterThanOrEqual(1)
    expect(result.skipped.every((s) => s.includes("unresolved Flags"))).toBe(
      true,
    )
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
