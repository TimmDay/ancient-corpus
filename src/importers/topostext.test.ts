import { describe, expect, it } from "vitest"
import { sections } from "./topostext.ts"

describe("sections", () => {
  it("splits a chapter at each section number in turn", () => {
    expect(
      sections(
        "Gordian ruled six years. 2. Near Ctesiphon he was killed. 3. His body lies near the border.",
        1,
      ),
    ).toEqual([
      { section: 1, html: "Gordian ruled six years." },
      { section: 2, html: "Near Ctesiphon he was killed." },
      { section: 3, html: "His body lies near the border." },
    ])
  })

  it("ignores numbers inside a sentence or out of sequence", () => {
    expect(
      sections(
        "He was killed at 21. 5. years old, they say. 2. Then Philip.",
        1,
      ),
    ).toEqual([
      { section: 1, html: "He was killed at 21. 5. years old, they say." },
      { section: 2, html: "Then Philip." },
    ])
  })

  it("starts a paragraph that opens mid-chapter at its own section", () => {
    expect(sections("Indeed, he hated wars. 11. And so.", 10)).toEqual([
      { section: 10, html: "Indeed, he hated wars." },
      { section: 11, html: "And so." },
    ])
  })

  it("steps over one number the source leaves out", () => {
    expect(sections("One. Two, unnumbered. 3. Three.", 1)).toEqual([
      { section: 1, html: "One. Two, unnumbered." },
      { section: 3, html: "Three." },
    ])
  })
})
