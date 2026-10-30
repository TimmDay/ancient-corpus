// pnpm works: the Works in the corpus as JSON, with the years they cover, how
// their Locators are written and their Editions: the MCP server's list_works.

import { listWorks, openCorpus } from "../src/mcp/tools.ts"

console.log(JSON.stringify(listWorks(openCorpus()), null, 1))
