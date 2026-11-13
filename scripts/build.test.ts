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

  it("holds back only Editions waiting for permission", () => {
    expect(result.published).toBeGreaterThanOrEqual(1)
    expect(
      result.skipped.every((s) =>
        unpublished.some((u) => s.startsWith(`${u.work}/${u.edition}`)),
      ),
    ).toBe(true)
  })

  it("publishes flagged Passages, each marked and listed above the text", () => {
    const page = read("cassius-dio/roman-history/42/index.html")
    const passage = page.slice(page.indexOf('id="42.24"'))
    expect(passage.slice(0, passage.indexOf("</section>"))).toMatch(
      /^id="42\.24"[^>]*>\s*<div class="flag-note" role="note" lang="en">[\s\S]*The numbering jumps from 42\.24 to 26\. Chapter 25 may be inside this Passage/,
    )
    expect(page).toContain('<section class="passage flagged" id="42.24"')
    expect(page).toContain('<a href="#42.24">42.24</a>')
    expect(page).toContain('<dialog class="flag-dialog" id="flag-dialog"')
    // The contents page links each flagged Passage to the book it is read on.
    expect(read("cassius-dio/roman-history/index.html")).toContain(
      '<a href="/cassius-dio/roman-history/42/#42.24">42.24</a>',
    )
    expect(read("index.html")).toMatch(
      /De Vita Caesarum<\/i><\/a> <span class="flag-tag"[^>]*>.*8 flagged<\/span>/,
    )
  })

  it("leaves Passages unflagged once their Flags are accepted", () => {
    // De Caesaribus 20 was flagged long, and accepted: the print has it so.
    const page = read("aurelius-victor/de-caesaribus/ancient-corpus/index.html")
    expect(page).toContain('<section class="passage" id="20"')
    expect(page).not.toContain("passage flagged")
    expect(page).not.toContain("flag-banner")
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

  it("shows a Passage's Annotations collapsed, after its text", () => {
    const page = read("anonymous/oracula-sibyllina/13/index.html")
    const passage = page.slice(page.indexOf('id="13.13"'))
    expect(passage.slice(0, passage.indexOf("</section>"))).toMatch(
      /<\/p>\s*<aside class="annotations"[^>]*>\s*<details class="annotation">\s*<summary><span class="annotation-label">Annotation<\/span> Gordian III<\/summary>/,
    )
  })

  it("gives every Passage an anchor and the page its Locator index", () => {
    const page = read("eutropius/breviarium/index.html")
    expect(page).toContain('<section class="passage" id="9.9"')
    expect(page).toContain('id="locator-index"')
    expect(page).toContain('lang="la"')
  })

  it("reads a long Edition a book at a time, from one link", () => {
    const book = read("cassius-dio/roman-history/44/index.html")
    expect(book).toContain('<section class="passage" id="44.19"')
    expect(book).not.toContain('id="45.1"')
    // The Work's own page knows which book holds every Locator.
    expect(read("cassius-dio/roman-history/index.html")).toContain(
      '"locator":"44.19","id":"44.19","page":"/cassius-dio/roman-history/44/"',
    )
    expect(read("cassius-dio/roman-history/80/index.html")).toContain(
      'id="80.1(Alexander)"',
    )
  })

  it("lists the Locators of Editions that share a language, for ?lang=", () => {
    const page = read("john-zonaras/epitome-historiarum/12/index.html")
    const locators = JSON.parse(
      /<script type="application\/json" id="edition-locators">(.*?)<\/script>/.exec(
        page,
      )?.[1] ?? "{}",
    ) as Record<string, string[]>
    expect(Object.keys(locators).sort()).toEqual(["ancient-corpus", "foster"])
    expect(locators.foster).toContain("8.1")
    expect(locators.foster).not.toContain("12.1")
    expect(locators["ancient-corpus"]).toContain("12.1")
    // A Work with one Edition per language needs no list.
    expect(read("zosimus/historia-nova/index.html")).not.toContain(
      "edition-locators",
    )
  })

  it("redirects long slugs, keeping the rest of the path", () => {
    expect(read("_redirects")).toContain(
      "/eutropius/breviarium-historiae-romanae/* /eutropius/breviarium/:splat 301",
    )
  })
})
