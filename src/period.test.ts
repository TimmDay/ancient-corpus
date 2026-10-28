import { describe, expect, it } from "vitest"
import {
  hasEditionText,
  loadWorks,
  readEditionText,
  type Work,
} from "./corpus.ts"
import { mayCover, periodOf } from "./period.ts"

const work = (fields: Partial<Work>): Work => ({
  slug: "a/b",
  author: "A",
  title: "B",
  otherTitles: [],
  originalLanguage: "la",
  writtenYearEarliest: null,
  writtenYearLatest: null,
  locatorFormat: null,
  slugAliases: [],
  locatorAliases: {},
  editions: [],
  ...fields,
})

describe("mayCover", () => {
  const dio = work({
    coversYearEarliest: -753,
    coversYearLatest: 229,
    divisionSpans: [["79", [216, 218]]],
  })

  it("keeps a Work whose Period covered overlaps the years, and drops one outside them", () => {
    expect(mayCover(dio, 244, 244)).toBe(false)
    expect(mayCover(dio, 220, 250)).toBe(true)
  })

  it("narrows by a division's own years, and falls back to the Work's for a division without them", () => {
    expect(mayCover(dio, 100, 120, "79")).toBe(false)
    expect(mayCover(dio, 100, 120, "68")).toBe(true)
  })

  it("never drops a Work with no recorded years, or with an unclear end", () => {
    expect(mayCover(work({}), 244, 244)).toBe(true)
    const chronicle = work({ coversYearEarliest: null, coversYearLatest: 417 })
    expect(mayCover(chronicle, -2000, -1000)).toBe(true)
    expect(mayCover(chronicle, 500, 600)).toBe(false)
  })
})

describe("every work.json", () => {
  for (const w of loadWorks()) {
    const { earliest, latest } = periodOf(w)
    const divisions = new Set(
      w.editions
        .filter((e) => hasEditionText(w, e))
        .flatMap((e) => readEditionText(w, e).divisions.map((d) => d.locator)),
    )

    it(`${w.slug}: years run forward and divisions exist`, () => {
      if (earliest !== undefined && latest !== undefined)
        expect(earliest).toBeLessThanOrEqual(latest)
      for (const [label, [from, to]] of w.divisionSpans ?? []) {
        expect(from, label).toBeLessThanOrEqual(to)
        if (earliest !== undefined)
          expect(from, label).toBeGreaterThanOrEqual(earliest)
        if (latest !== undefined) expect(to, label).toBeLessThanOrEqual(latest)
        if (divisions.size) expect(divisions, label).toContain(label)
      }
    })
  }
})
