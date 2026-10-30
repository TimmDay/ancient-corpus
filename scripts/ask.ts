// pnpm ask "<question>" [--limit N]: the candidate Passages for a question as
// JSON, for a chat model (or a person) to judge: the same as the MCP server's
// search tool, for agents that run commands instead (pi). Uses semantic search
// too when Ollama is running and the index has vectors.

import { parseArgs } from "node:util"
import { SITE, openCorpus, searchCorpus } from "../src/mcp/tools.ts"
import { openIndex } from "../src/search/index.ts"
import { embedWithOllama, ollamaReady } from "../src/search/ollama.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { limit: { type: "string" } },
})
const question = positionals.join(" ")
if (!question) {
  console.error('Usage: pnpm ask "what happened to Valerian?" [--limit 30]')
  process.exit(1)
}

const result = await searchCorpus(openCorpus(), openIndex(), SITE, question, {
  embed: (await ollamaReady()) ? embedWithOllama : undefined,
  limit: values.limit ? Number(values.limit) : undefined,
})
console.log(JSON.stringify(result, null, 1))
