import { describe, expect, it } from "vitest"
import type { Passage } from "./corpus.ts"
import {
  markPlaceReferences,
  problemWith,
  type PlaceReference,
} from "./place-references.ts"
import type { Place, PlaceId } from "./places.ts"

const passage = (locator: string, ...blocks: string[]) =>
  ({ locator, blocks }) as unknown as Passage

const ref = (
  text: string,
  extra: Partial<PlaceReference> = {},
): PlaceReference => ({
  locator: "1.8",
  text,
  state: "resolved",
  place: "pleiades:893976",
  explicit: true,
  by: "hand",
  ...extra,
})

const mark = (passages: Passage[], refs: PlaceReference[]) =>
  markPlaceReferences(passages, refs, "test")

const button = (text: string) =>
  `<button type="button" class="place-ref" data-place="pleiades:893976">${text}</button>`

describe("markPlaceReferences", () => {
  it("wraps the name in a button, leaving the text as it was", () => {
    const p = passage("1.8", "took Ctesiphon and Babylon")
    expect(mark([p], [ref("Ctesiphon")]).get(p)).toEqual([
      `took ${button("Ctesiphon")} and Babylon`,
    ])
  })

  it("matches the Greek as written, inflected", () => {
    const p = passage("1.8", "Κτησιφῶντα εἷλε")
    expect(mark([p], [ref("Κτησιφῶντα")]).get(p)?.[0]).toContain(
      button("Κτησιφῶντα"),
    )
  })

  it("matches whole words only, outside tags and note references", () => {
    const p = passage(
      "1.8",
      'Edessan <a title="Edessa">x</a><sup class="nref">Edessa</sup> and Edessa.',
    )
    expect(mark([p], [ref("Edessa")]).get(p)?.[0]).toBe(
      `Edessan <a title="Edessa">x</a><sup class="nref">Edessa</sup> and ${button("Edessa")}.`,
    )
  })

  it("marks only explicit, resolved references", () => {
    const p = passage("1.8", "the city of Ctesiphon")
    const out = mark(
      [p],
      [
        ref("the city", { explicit: false }),
        ref("Ctesiphon", { state: "ambiguous", candidates: ["pleiades:1"] }),
      ],
    )
    expect(out.get(p)).toEqual(["the city of Ctesiphon"])
  })

  it("picks the occurrence asked for, counting across a Passage printed in parts", () => {
    const first = passage("1.8", "Nisibis fell.")
    const other = passage("1.9", "Nisibis")
    const resumed = passage("1.8", "Again Nisibis.")
    const out = mark(
      [first, other, resumed],
      [ref("Nisibis", { occurrence: 2 })],
    )
    expect(out.get(first)).toEqual(["Nisibis fell."])
    expect(out.get(resumed)?.[0]).toBe(`Again ${button("Nisibis")}.`)
  })

  it("fails loudly when the text is missing or ambiguous", () => {
    const p = passage("1.8", "Nisibis and Nisibis")
    expect(() => mark([p], [ref("Amida")])).toThrow(/text not found/)
    expect(() => mark([p], [ref("Nisibis")])).toThrow(/occurs 2 times/)
    expect(() => mark([p], [ref("Nisibis", { occurrence: 3 })])).toThrow(
      /occurrence 3/,
    )
    expect(() => mark([p], [ref("Nisibis", { locator: "9.9" })])).toThrow(
      /no such Passage/,
    )
  })
})

describe("problemWith", () => {
  const places = new Map([
    ["pleiades:893976" as PlaceId, {} as Place],
    ["pleiades:1" as PlaceId, {} as Place],
  ])

  it("accepts a complete reference", () => {
    expect(problemWith(ref("Ctesiphon"), places)).toBeUndefined()
    expect(
      problemWith(
        ref("Alexandria", {
          state: "ambiguous",
          place: undefined,
          candidates: ["pleiades:1"],
          by: { model: "claude-opus-5-5", date: "2026-11-19" },
        }),
        places,
      ),
    ).toBeUndefined()
  })

  it("refuses one that is incomplete or names a Place not in the snapshot", () => {
    expect(problemWith(ref("X", { place: undefined }), places)).toMatch(
      /needs a Place/,
    )
    expect(problemWith(ref("X", { place: "pleiades:404" }), places)).toMatch(
      /not in the snapshot/,
    )
    expect(
      problemWith(ref("X", { state: "ambiguous", place: undefined }), places),
    ).toMatch(/candidates/)
    expect(
      problemWith(ref("X", { by: undefined as unknown as "hand" }), places),
    ).toMatch(/who made it/)
  })
})
