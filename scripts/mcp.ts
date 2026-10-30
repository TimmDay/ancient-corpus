// node scripts/mcp.ts: the corpus as an MCP server over stdio, for Claude Desktop, Claude
// Code or a local model to search and read the texts with reader links
// (docs/v2-vector-search.md). Reads the committed Passages and the local index;
// semantic search needs Ollama, keyword search does not.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import {
  SITE,
  listWorks,
  openCorpus,
  readPassage,
  searchCorpus,
} from "../src/mcp/tools.ts"
import { openIndex } from "../src/search/index.ts"
import { embedWithOllama, ollamaReady } from "../src/search/ollama.ts"

const INSTRUCTIONS = `The Ancient Corpus: ancient histories in their original languages and in English, each Passage at a reader link.

To answer a question from the sources:
1. Call search with the question. It returns a wide list of candidate Passages, on purpose: read every one and keep only those that bear on the question.
2. Answer with a list of Findings. A Finding is a Passage, or Sentences within it, with one line on why it is relevant. Link each to its url; to point at Sentences, add @N or @N-M to the url (url#9.2@3-4), using the [N] numbers in its text.
3. Say how many candidates you dropped, and state the Coverage: the Works searched. A Work missing from the Coverage is not in the corpus yet, so its silence means nothing.
4. Write a summary only when asked, and cite only the Findings in it.

Use read_passage for the Passages around a Finding, or another Edition of it, and list_works to see what the corpus holds.`

const corpus = openCorpus()
const db = openIndex()
const server = new McpServer(
  { name: "ancient-corpus", version: "0.1.0" },
  { instructions: INSTRUCTIONS },
)

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }],
})

server.registerTool(
  "search",
  {
    description:
      "Find every Passage that may bear on a question, in any language of the corpus. Returns candidates for you to judge, each with its text as numbered Sentences and a reader url, plus the Coverage (the Works searched).",
    inputSchema: {
      question: z.string().describe("The question, in plain words."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Candidates to return; 30 by default."),
    },
  },
  async ({ question, limit }) =>
    json(
      await searchCorpus(corpus, db, SITE, question, {
        embed: (await ollamaReady()) ? embedWithOllama : undefined,
        limit,
      }),
    ),
)

server.registerTool(
  "read_passage",
  {
    description:
      "Read a Passage, a range (9.2-9.4) or a whole book or Life, in the Work's preferred Edition (normally the original language) unless an Edition or language is asked for.",
    inputSchema: {
      work: z
        .string()
        .describe(
          'The Work: its id from list_works ("eutropius/breviarium") or its title.',
        ),
      locator: z
        .string()
        .describe(
          'Where in the Work: "9.2", "Three Gordians 30", "1.18-1.19".',
        ),
      edition: z.string().optional().describe("An Edition id from list_works."),
      lang: z
        .string()
        .optional()
        .describe('A language code ("en", "la", "grc") to read it in.'),
    },
  },
  (input) => json(readPassage(corpus, SITE, input)),
)

server.registerTool(
  "list_works",
  {
    description:
      "The Works in the corpus: author, title, the years they cover, how their Locators are written, and their Editions.",
  },
  () => json(listWorks(corpus)),
)

await server.connect(new StdioServerTransport())
