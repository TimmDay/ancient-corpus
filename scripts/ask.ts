// pnpm ask "<question>" [--limit N]: prints the candidate Passages for a
// question as JSON, for a chat model (or a person) to judge. Uses semantic
// search too when Ollama is running and the index has vectors.

import { openIndex } from "../src/search/index.ts"
import { embedWithOllama, ollamaReady } from "../src/search/ollama.ts"
import { search } from "../src/search/search.ts"

const args = process.argv.slice(2)
const limitAt = args.indexOf("--limit")
const limit = limitAt === -1 ? undefined : Number(args[limitAt + 1])
const question = args
  .filter((_, i) => limitAt === -1 || (i !== limitAt && i !== limitAt + 1))
  .join(" ")
if (!question) {
  console.error('Usage: pnpm ask "what happened to Valerian?" [--limit 50]')
  process.exit(1)
}

const result = await search(openIndex(), question, {
  embed: (await ollamaReady()) ? embedWithOllama : undefined,
  limit,
})
console.log(JSON.stringify(result, null, 2))
