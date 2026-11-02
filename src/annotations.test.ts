import { describe, expect, it } from "vitest"
import {
  annotationsByLocator,
  problemWith,
  readAnnotations,
  type Annotation,
} from "./annotations.ts"
import { hasEditionText, loadWorks, readEditionText } from "./corpus.ts"
import { locatorId, resolveLocator, type LocatorIndex } from "./locator.ts"
import { locatorIndex } from "./site/render.ts"

const annotation = (fields: Partial<Annotation>): Annotation => ({
  locator: "13.13",
  identifies: ["Gordian III"],
  note: "The young Ares is Gordian III.",
  ...fields,
})

describe("problemWith", () => {
  it("accepts an Annotation that cites a source, or says it is our own reading", () => {
    expect(problemWith(annotation({ sources: ["Potter 1990"] }))).toBe(
      undefined,
    )
    expect(problemWith(annotation({ unsupported: true }))).toBe(undefined)
  })

  it("refuses one that does neither, or both", () => {
    expect(problemWith(annotation({}))).toMatch(/cites no source/)
    expect(problemWith(annotation({ sources: [" "] }))).toMatch(
      /cites no source/,
    )
    expect(
      problemWith(annotation({ sources: ["Potter"], unsupported: true })),
    ).toMatch(/also marked unsupported/)
  })

  it("refuses one that identifies nothing or says nothing", () => {
    expect(
      problemWith(annotation({ identifies: [], unsupported: true })),
    ).toMatch(/identifies nothing/)
    expect(problemWith(annotation({ note: "", unsupported: true }))).toMatch(
      /no note/,
    )
  })
})

describe("annotationsByLocator", () => {
  const index = (lines: boolean, ...locators: string[]): LocatorIndex => ({
    targets: locators.map((locator) => ({ locator, id: locatorId(locator) })),
    aliases: {},
    ...(lines ? { lines: true as const } : {}),
  })

  it("puts an Annotation on every Passage of its range", () => {
    const byLocator = annotationsByLocator(
      [annotation({ locator: "79.1-3", unsupported: true })],
      index(false, "79.1", "79.2", "79.3", "79.4"),
    )
    expect([...byLocator.keys()]).toEqual(["79.1", "79.2", "79.3"])
  })

  it("finds the Passage a line is in, in a Work cited by line", () => {
    const byLocator = annotationsByLocator(
      [annotation({ locator: "13.15", unsupported: true })],
      index(true, "13.1", "13.13", "13.21"),
    )
    expect([...byLocator.keys()]).toEqual(["13.13"])
  })
})

describe("the corpus's Annotations", () => {
  it("each cite a source or are marked ours, and land on a Passage in every Edition", () => {
    for (const work of loadWorks()) {
      const annotations = readAnnotations(work)
      for (const edition of work.editions.filter(
        (e) => hasEditionText(work, e) && !e.unpublished,
      )) {
        const index = locatorIndex(work, readEditionText(work, edition))
        for (const a of annotations)
          expect(
            resolveLocator(a.locator, index),
            `${work.slug}/${edition.slug}: ${a.locator}`,
          ).toMatchObject({ kind: "found", exact: true })
      }
    }
  })
})
