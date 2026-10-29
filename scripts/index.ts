// pnpm index [--keywords-only]: rebuilds indexes/corpus.sqlite from every
// committed Passage. Embeds with BGE-M3 in Ollama, which must be running;
// --keywords-only builds keyword search alone, without Ollama.

import { buildIndex, corpusPassages, openIndex } from "../src/search/index.ts"
import {
  HOW_TO_START,
  embedWithOllama,
  ollamaReady,
} from "../src/search/ollama.ts"

const keywordsOnly = process.argv.includes("--keywords-only")
if (!keywordsOnly && !(await ollamaReady())) {
  console.error(
    `${HOW_TO_START}\nOr build keyword search alone: pnpm index --keywords-only`,
  )
  process.exit(1)
}

const passages = corpusPassages()
const built = await buildIndex(
  openIndex(),
  passages,
  keywordsOnly ? undefined : embedWithOllama,
  undefined,
  (done, total) => process.stdout.write(`\rEmbedding ${done}/${total}`),
)
console.log(
  `\nIndexed ${built.passages} Passages; ${built.pieces} pieces with vectors (${built.embedded} newly embedded).`,
)
