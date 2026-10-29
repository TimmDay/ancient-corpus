// pnpm ask:check [--limit N]: asks every test question in
// src/search/questions.ts and reports how many of its expected Passages the
// search found among its candidates, and how high it ranked them.

import { openIndex } from "../src/search/index.ts"
import { embedWithOllama, ollamaReady } from "../src/search/ollama.ts"
import { TEST_QUESTIONS } from "../src/search/questions.ts"
import { search } from "../src/search/search.ts"

const limitAt = process.argv.indexOf("--limit")
const limit = limitAt === -1 ? 50 : Number(process.argv[limitAt + 1])
const embed = (await ollamaReady()) ? embedWithOllama : undefined
const db = openIndex()

let found = 0
let expected = 0
for (const test of TEST_QUESTIONS) {
  const { candidates, semantic } = await search(db, test.question, {
    embed,
    limit,
  })
  const ranks = test.expected.map(({ work, locator }) =>
    candidates.findIndex((c) => c.work === work && c.locator === locator),
  )
  const hits = ranks.filter((r) => r !== -1)
  found += hits.length
  expected += test.expected.length
  console.log(
    `${hits.length}/${test.expected.length}  ${test.question}${semantic ? "" : "  (keywords only)"}`,
  )
  test.expected.forEach(({ locator }, i) => {
    const rank = ranks[i] ?? -1
    console.log(
      `      ${rank === -1 ? "missed" : `#${rank + 1}`.padStart(6)}  ${locator}`,
    )
  })
}
console.log(
  `\nFound ${found} of ${expected} expected Passages (${Math.round((100 * found) / expected)}%) in the top ${limit}.`,
)
