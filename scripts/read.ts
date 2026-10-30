// pnpm read "<work>" "<locator>" [--edition slug] [--lang en]: a Passage, a
// range or a whole book as JSON, with its text as numbered Sentences and its
// reader link: the MCP server's read_passage tool, for agents that run commands.

import { parseArgs } from "node:util"
import { SITE, openCorpus, readPassage } from "../src/mcp/tools.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { edition: { type: "string" }, lang: { type: "string" } },
})
const [work, ...locator] = positionals
if (!work || !locator.length) {
  console.error('Usage: pnpm read "Zosimus" "1.18-1.19" [--lang en]')
  process.exit(1)
}

console.log(
  JSON.stringify(
    readPassage(openCorpus(), SITE, {
      work,
      locator: locator.join(" "),
      ...values,
    }),
    null,
    1,
  ),
)
