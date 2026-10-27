import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "../src/corpus.ts"
import { build } from "./build.ts"

// Builds from the committed works/, exactly as CI and Cloudflare do.
describe("build", () => {
  const result = build()
  const read = (file: string) =>
    readFileSync(path.join(REPO_ROOT, "dist", file), "utf8")

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

  it("redirects long slugs, keeping the rest of the path", () => {
    expect(read("_redirects")).toContain(
      "/eutropius/breviarium-historiae-romanae/* /eutropius/breviarium/:splat 301",
    )
  })
})
