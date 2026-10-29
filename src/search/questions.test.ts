import { describe, expect, it } from "vitest"
import { corpusPassages } from "./index.ts"
import { TEST_QUESTIONS } from "./questions.ts"

describe("test questions", () => {
  const known = new Set(corpusPassages().map((p) => `${p.work} ${p.locator}`))

  it("expect only Passages that exist", () => {
    const missing = TEST_QUESTIONS.flatMap((q) => q.expected)
      .map(({ work, locator }) => `${work} ${locator}`)
      .filter((key) => !known.has(key))
    expect(missing).toEqual([])
  })
})
