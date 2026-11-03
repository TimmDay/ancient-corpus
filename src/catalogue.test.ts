import { describe, expect, it } from "vitest"
import {
  duplicatedFields,
  readCatalogue,
  renderCatalogue,
} from "./catalogue.ts"
import { loadWorks } from "./corpus.ts"

describe("the Catalogue", () => {
  const works = loadWorks()
  const entries = readCatalogue().sections.flatMap((s) => s.entries)
  const listed = entries.flatMap((e) => (e.work ? [e.work] : []))

  it("lists every Work in the corpus once, and only Works that exist", () => {
    const slugs = works.map((w) => w.slug).sort()
    expect([...listed].sort()).toEqual(slugs)
  })

  it("takes from work.json what it records, rather than saying it twice", () => {
    for (const entry of entries) {
      const work = works.find((w) => w.slug === entry.work)
      if (work) expect(duplicatedFields(entry, work), work.slug).toEqual([])
      else expect(entry.author && entry.title && entry.language).toBeTruthy()
    }
  })

  // `pnpm ingest` rewrites CATALOGUE.md; update it by hand with `vitest -u`.
  it("matches CATALOGUE.md", async () => {
    await expect(
      await renderCatalogue(readCatalogue(), works),
    ).toMatchFileSnapshot("../CATALOGUE.md")
  })
})
