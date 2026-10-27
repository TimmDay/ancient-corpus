// pnpm review: a local page for working through an Edition's Flags. Every
// action is written to that Edition's corrections.json and the Edition is
// re-imported at once, so what you see is always the corrected text. Commit
// corrections.json and the regenerated Passage files when you are done.
// Needs the Edition's archive in data/intake/. Never deployed.

import { readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"
import {
  REPO_ROOT,
  hasEditionText,
  loadWorks,
  readEditionText,
  unresolvedFlags,
  type Edition,
  type Passage,
  type Work,
} from "../src/corpus.ts"
import type { Correction } from "../src/corrections.ts"
import { escapeHtml } from "../src/importers/gutenberg.ts"
import {
  correctionsFile,
  importEdition,
  readCorrections,
} from "../src/importing.ts"

const PORT = Number(process.env.PORT ?? 4322)

function find(
  workSlug: string,
  editionSlug: string,
): { work: Work; edition: Edition } {
  const work = loadWorks().find((w) => w.slug === workSlug)
  const edition = work?.editions.find((e) => e.slug === editionSlug)
  if (!work || !edition)
    throw new Error(`No Edition ${workSlug}/${editionSlug}`)
  return { work, edition }
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap">
<link rel="stylesheet" href="/site.css"><style>${REVIEW_CSS}</style></head>
<body><main class="review" id="main"><p><a href="/">All Editions</a></p>${body}</main><script>${REVIEW_JS}</script></body></html>`
}

function indexPage(): string {
  const rows = loadWorks().flatMap((work) =>
    work.editions
      .filter((e) => hasEditionText(work, e))
      .map((edition) => {
        const flags = unresolvedFlags(readEditionText(work, edition)).length
        return `<li><a href="/e/${work.slug}/${edition.slug}">${escapeHtml(work.author)}, <i>${escapeHtml(work.title)}</i> (${escapeHtml(edition.slug)})</a> <span class="${flags ? "count" : "done"}">${flags ? `${flags} to review` : "ready to publish"}</span></li>`
      }),
  )
  return page(
    "Review",
    `<h1>Review Flags</h1><ul class="editions-list">${rows.join("")}</ul>`,
  )
}

function editionPage(work: Work, edition: Edition): string {
  const text = readEditionText(work, edition)
  const flagged = text.passages.filter((p) => p.flags.some((f) => !f.accepted))
  const corrections = readCorrections(work, edition)
  const items = flagged.map((passage) => {
    const i = text.passages.indexOf(passage)
    const before = text.passages[i - 1]
    const after = text.passages[i + 1]
    const sameDivision = (p?: Passage) => p?.division === passage.division
    return `<section class="flagged" data-locator="${attr(passage.locator)}">
<h2>${escapeHtml(passage.locator)}</h2>
<ul class="flags">${passage.flags
      .filter((f) => !f.accepted)
      .map((f) => `<li><b>${f.code}</b>: ${escapeHtml(f.detail)}</li>`)
      .join("")}</ul>
${sameDivision(before) && before ? `<div class="context"><span>${escapeHtml(before.locator)} ends:</span>${blockHtml(before.blocks.at(-1) ?? "")}</div>` : ""}
<div class="passage-text" tabindex="0" aria-label="Text of ${attr(passage.locator)}">${passage.blocks.map((b) => blockHtml(b)).join("")}</div>
${sameDivision(after) && after ? `<div class="context"><span>${escapeHtml(after.locator)} begins:</span>${blockHtml(after.blocks[0] ?? "")}</div>` : ""}
<div class="actions">
<p class="hint">Select the words where the problem starts, then choose an action.</p>
<div class="row"><label>New Locator <input name="newLocator" value="${attr(nextLocator(passage.locator))}"></label><button data-op="split">Split at selection</button></div>
<div class="row"><label>Editorial title <input name="title" value="${attr(`Translator’s essay after ${passage.locator}`)}"></label><button data-op="toEditorial">Move selection onward to Editorial matter</button></div>
<div class="row"><button data-op="merge">Merge into the Passage before</button></div>
<div class="row">${passage.flags
      .filter((f) => !f.accepted)
      .map(
        (f) =>
          `<label>Why this ${f.code} Flag is fine <input name="reason-${f.code}" placeholder="e.g. Suetonius’s own long chapter"></label><button data-op="accept" data-flag="${f.code}">Accept</button>`,
      )
      .join("")}</div>
</div>
</section>`
  })
  const history = corrections.length
    ? `<details class="history"><summary>${corrections.length} Corrections so far</summary><ol>${corrections
        .map((c) => `<li><code>${escapeHtml(JSON.stringify(c))}</code></li>`)
        .join(
          "",
        )}</ol></details><p><button data-op="undo">Undo the last Correction</button></p>`
    : ""
  return page(
    `Review ${work.slug}`,
    `<h1>${escapeHtml(work.author)}, <i>${escapeHtml(work.title)}</i></h1>
<p>${escapeHtml(edition.slug)}: ${flagged.length ? `${flagged.length} Passages to review.` : "No Flags left. Run <code>pnpm build</code> and commit."}</p>
<p class="status" role="status" id="status"></p>
${history}
<div data-work="${attr(work.slug)}" data-edition="${attr(edition.slug)}" id="edition">${items.join("")}</div>`,
  )
}

function blockHtml(block: string): string {
  return `<p>${block.replace(/<sup class="nref">.*?<\/sup>/g, "")}</p>`
}

function nextLocator(locator: string): string {
  return locator.replace(/(\d+)$/, (n) => String(Number(n) + 1))
}

function attr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;")
}

function applyCorrection(
  work: Work,
  edition: Edition,
  change: { add?: Correction; undo?: boolean },
): string {
  const file = correctionsFile(work, edition)
  const previous = readCorrections(work, edition)
  const next = change.undo
    ? previous.slice(0, -1)
    : [...previous, ...(change.add ? [change.add] : [])]
  writeFileSync(file, JSON.stringify(next, null, 2) + "\n")
  try {
    const text = importEdition(work, edition)
    return `${unresolvedFlags(text).length} Flags left`
  } catch (error) {
    writeFileSync(file, JSON.stringify(previous, null, 2) + "\n")
    importEdition(work, edition)
    throw error
  }
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`)
  const send = (status: number, type: string, body: string) =>
    response
      .writeHead(status, { "content-type": `${type}; charset=utf-8` })
      .end(body)
  try {
    if (url.pathname === "/") return send(200, "text/html", indexPage())
    if (url.pathname === "/site.css")
      return send(
        200,
        "text/css",
        readFileSync(path.join(REPO_ROOT, "site", "site.css"), "utf8"),
      )
    const match = /^\/e\/([^/]+\/[^/]+)\/([^/]+)$/.exec(url.pathname)
    if (match?.[1] && match[2]) {
      const { work, edition } = find(match[1], match[2])
      return send(200, "text/html", editionPage(work, edition))
    }
    if (url.pathname === "/api/correct" && request.method === "POST") {
      let raw = ""
      request.on("data", (chunk: Buffer) => (raw += chunk.toString()))
      request.on("end", () => {
        try {
          const body = JSON.parse(raw) as {
            work: string
            edition: string
            correction?: Correction
            undo?: boolean
          }
          const { work, edition } = find(body.work, body.edition)
          send(
            200,
            "text/plain",
            applyCorrection(work, edition, {
              add: body.correction,
              undo: body.undo,
            }),
          )
        } catch (error) {
          send(
            400,
            "text/plain",
            error instanceof Error ? error.message : String(error),
          )
        }
      })
      return
    }
    send(404, "text/plain", "Not found")
  } catch (error) {
    send(
      500,
      "text/plain",
      error instanceof Error ? error.message : String(error),
    )
  }
}).listen(PORT, () => console.log(`Review Flags at http://localhost:${PORT}`))

const REVIEW_CSS = `
.review { max-width: 50rem; margin: 0 auto; padding: 1rem 1rem 6rem; }
.editions-list li { margin: 0.4rem 0; }
.count { color: var(--accent); margin-left: 0.5rem; }
.done { color: var(--muted); margin-left: 0.5rem; }
.flagged { border-top: 2px solid var(--rule); margin-top: 2.5rem; padding-top: 1rem; }
.flags { color: var(--accent); }
.context { color: var(--muted); font-size: 1rem; border-left: 3px solid var(--rule); padding-left: 0.75rem; margin: 1rem 0; }
.context span { font-style: italic; }
.passage-text { max-height: 32rem; overflow-y: auto; border: 1px solid var(--rule); padding: 0.5rem 1rem; background: var(--surface); }
.actions { padding: 0.5rem 0; font-size: 1rem; }
.row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; margin: 0.4rem 0; }
.row label { display: flex; flex-direction: column; font-size: 0.9rem; color: var(--muted); }
.row input { font: inherit; padding: 0.3rem 0.5rem; min-width: 16rem; }
button { font: inherit; padding: 0.35rem 0.8rem; cursor: pointer; }
.status { position: fixed; left: 50%; bottom: 1rem; transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 0.4rem 1rem; border-radius: 6px; }
.status:empty { display: none; }
.hint { margin: 0; color: var(--muted); }
`

const REVIEW_JS = `
const root = document.getElementById("edition");
const status = document.getElementById("status");
async function send(payload) {
  status.textContent = "Re-importing…";
  const response = await fetch("/api/correct", { method: "POST", body: JSON.stringify({ work: root?.dataset.work, edition: root?.dataset.edition, ...payload }) });
  const message = await response.text();
  if (!response.ok) { status.textContent = "Not applied: " + message; return; }
  location.reload();
}
function selectionIn(section) {
  const selection = window.getSelection();
  const text = selection ? selection.toString().replace(/\\s+/g, " ").trim() : "";
  if (!text || !section.querySelector(".passage-text").contains(selection.anchorNode)) return "";
  return text.slice(0, 120);
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-op]");
  if (!button) return;
  const op = button.dataset.op;
  if (op === "undo") return send({ undo: true });
  const section = button.closest(".flagged");
  const locator = section.dataset.locator;
  const field = (name) => section.querySelector('input[name="' + name + '"]').value.trim();
  if (op === "accept") {
    const reason = field("reason-" + button.dataset.flag);
    if (!reason) { status.textContent = "Say why the Flag is fine before accepting it."; return; }
    return send({ correction: { op, locator, flag: button.dataset.flag, reason } });
  }
  if (op === "merge") return send({ correction: { op, locator } });
  const at = selectionIn(section);
  if (!at) { status.textContent = "First select the words in " + locator + " where it should be cut."; return; }
  if (op === "split") return send({ correction: { op, locator, at, newLocator: field("newLocator") } });
  if (op === "toEditorial") return send({ correction: { op, locator, at, title: field("title") } });
});
`
