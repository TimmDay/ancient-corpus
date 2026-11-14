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

  it("reads Eusebius and Lactantius on Aurelian, in the original and in English", () => {
    const greek = read("eusebius/historia-ecclesiastica/7/index.html")
    expect(greek).toContain('<section class="passage" id="7.praef"')
    expect(greek).toContain('<section class="passage" id="7.30"')
    // Dindorf's margin references to Nicephorus are not Eusebius's text.
    expect(greek).not.toContain("Nic. H. E.")
    const english = read(
      "eusebius/historia-ecclesiastica/mcgiffert/7/index.html",
    )
    expect(english).toContain("the Emperor Aurelian was petitioned")
    expect(english).toContain(
      "Chapter XXX.—<i>The Epistle of the Bishops against Paul.</i>",
    )
    // Only the appendix the Greek numbers apart is a Passage of its own.
    expect(
      read("eusebius/historia-ecclesiastica/mcgiffert/8/index.html"),
    ).toContain('id="8.appendix"')
    expect(
      read("eusebius/historia-ecclesiastica/mcgiffert/10/index.html"),
    ).not.toContain('id="10.appendix"')
    expect(read("lactantius/de-mortibus-persecutorum/index.html")).toMatch(
      /id="6"[^>]*>[\s\S]*?Aurelianus, qui esset natura vesanus/,
    )
    expect(
      read("lactantius/de-mortibus-persecutorum/fletcher/index.html"),
    ).toContain(
      "Aurelian might have recollected the fate of the captived emperor",
    )
  })

  it("reads Dexippus on Aurelian's embassies, in Müller's Greek and our English", () => {
    const greek = read("dexippus/scythica/index.html")
    expect(greek).toMatch(
      /id="24"[^>]*>[\s\S]*?Ὅτε Αὐρηλιανὸς κατὰ κράτος νικήσας τοὺς Ἰουθούγγους Σκύθας/,
    )
    // Müller's markers for his notes are dropped; his notes stay.
    expect(greek).not.toContain("Ἰουθούγγους (*)")
    expect(read("dexippus/scythica/ancient-corpus/index.html")).toContain(
      "When Aurelian had defeated the Juthungian Scythians outright",
    )
  })

  it("links every translation to its human translator, to read or to thank", () => {
    expect(
      read("aurelius-victor/de-caesaribus/ancient-corpus/index.html"),
    ).toContain(
      '<p class="human-translation">Read a human translation: <a href="https://search.worldcat.org/search?q=bn:0853232180">H. W. Bird',
    )
    expect(read("anonymous/historia-augusta/magie/index.html")).toContain(
      '<p class="human-translation">Translated by <a href="https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Historia_Augusta/home.html">David Magie',
    )
    const unthanked = loadWorks().flatMap((w) =>
      w.editions
        .filter((e) => e.language !== w.originalLanguage && !e.humanTranslation)
        .map((e) => `${w.slug}/${e.slug}`),
    )
    expect(unthanked).toEqual([])
  })

  it("reads Festus on Aurelian and Zenobia, in Latin and in Banchich and Meka's English", () => {
    expect(read("festus/breviarium/index.html")).toMatch(
      /id="24"[^>]*>[\s\S]*?Zenobia/,
    )
    const english = read("festus/breviarium/banchich-meka/index.html")
    expect(english).toContain("Copyright (C) 2001, Thomas Banchich")
    expect(english).toMatch(
      /id="24"[^>]*>[\s\S]*?Aurelian defeated her, relying on many thousands of armored horsemen/,
    )
    expect(english).toContain("Index of Names of Individuals")
  })

  it("reads Orosius a book at a time, with our English for the third century", () => {
    expect(read("orosius/historiae/7/index.html")).toMatch(
      /id="7\.23"[^>]*>[\s\S]*?Aurelianus uicesimus nonus imperium adeptus/,
    )
    // Orosius bolds the names of places; they stay in the text.
    expect(read("orosius/historiae/1/index.html")).toContain(
      "Asiam Europam et Africam",
    )
    expect(read("orosius/historiae/1/index.html")).toContain('id="1.praef"')
    const english = read("orosius/historiae/ancient-corpus/index.html")
    expect(english).toContain("he routed the Goths in great battles")
    expect(english).toMatch(
      /id="1\.praef"[^>]*>[\s\S]*?most blessed father Augustine/,
    )
  })

  it("redirects long slugs, keeping the rest of the path", () => {
    expect(read("_redirects")).toContain(
      "/eutropius/breviarium-historiae-romanae/* /eutropius/breviarium/:splat 301",
    )
  })
})
