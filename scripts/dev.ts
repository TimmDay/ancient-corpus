// pnpm dev: builds the site and serves dist/ the way Cloudflare Pages does,
// including _redirects and directory indexes, at http://localhost:4321.

import { existsSync, readFileSync, statSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"
import { REPO_ROOT } from "../src/corpus.ts"
import { build } from "./build.ts"

const DIST = path.join(REPO_ROOT, "dist")
const PORT = Number(process.env.PORT ?? 4321)
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
}

const { published, skipped } = build()
for (const s of skipped) console.warn(`NOT PUBLISHED: ${s}`)

const rules = readFileSync(path.join(DIST, "_redirects"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split(" ") as [string, string, string])

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`)
  const pathname = decodeURIComponent(url.pathname)

  for (const [from, to, status] of rules) {
    const splat =
      from.endsWith("/*") && pathname.startsWith(from.slice(0, -1))
        ? pathname.slice(from.length - 1)
        : undefined
    if (pathname === from || splat !== undefined) {
      response
        .writeHead(Number(status), {
          location: to.replace(":splat", splat ?? "") + url.search,
        })
        .end()
      return
    }
  }

  let file = path.join(DIST, pathname)
  if (!file.startsWith(DIST)) return void response.writeHead(400).end()
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!pathname.endsWith("/"))
      return void response
        .writeHead(308, { location: `${pathname}/${url.search}` })
        .end()
    file = path.join(file, "index.html")
  }
  const found = existsSync(file) && statSync(file).isFile()
  response.writeHead(found ? 200 : 404, {
    "content-type":
      TYPES[path.extname(found ? file : ".html")] ?? "application/octet-stream",
  })
  response.end(readFileSync(found ? file : path.join(DIST, "404.html")))
}).listen(PORT, () =>
  console.log(`${published} Works at http://localhost:${PORT}`),
)
