// pnpm review: a local page for working through an Edition's Flags. Every
// action is written to that Edition's corrections.json and the Edition is
// re-imported at once, so what you see is always the corrected text. Commit
// corrections.json and the regenerated Passage files when you are done.
// Needs the Edition's archive in data/intake/. Never deployed.

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"
import { buildSync } from "esbuild"
import {
  REPO_ROOT,
  hasEditionText,
  loadWorks,
  readEditionText,
  unresolvedFlags,
  editionDir,
  type Edition,
  type Flag,
  type FlagCode,
  type IntakeArchive,
  type Passage,
  type Work,
} from "../src/corpus.ts"
import type { Correction } from "../src/corrections.ts"
import { escapeHtml, readIntakeHtml } from "../src/importers/gutenberg.ts"
import { THEME_SCRIPT, THEME_TOGGLE } from "../src/site/render.ts"
import {
  correctionsFile,
  importEdition,
  readCorrections,
} from "../src/importing.ts"

const PORT = Number(process.env.PORT ?? 4322)

/** The reader's theme toggle, bundled once when the server starts. */
const SITE_JS =
  buildSync({
    entryPoints: [path.join(REPO_ROOT, "src", "client", "site.ts")],
    bundle: true,
    format: "iife",
    write: false,
  }).outputFiles[0]?.text ?? ""

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
<link rel="stylesheet" href="/site.css"><style>${REVIEW_CSS}</style>${THEME_SCRIPT}<script src="/site.js" defer></script></head>
<body><header class="site-header"><div class="site-header-inner"><a class="brand" href="/">Review</a>${THEME_TOGGLE}</div></header><main class="review" id="main"><p><a href="/">All Editions</a></p>${body}</main><script>${REVIEW_JS}</script></body></html>`
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

/**
 * An answer to a Flag found by checking the printed volume, waiting for the
 * owner to confirm it. Kept in suggestions.json beside corrections.json.
 */
type Suggestion = {
  locator: string
  flag: FlagCode
  /** What the printed volume shows. */
  finding: string
  /** The archive whose printed volume shows it, and the page. */
  archive: string
  page: number
  corrections: Correction[]
}

function readSuggestions(work: Work, edition: Edition): Suggestion[] {
  const file = path.join(editionDir(work, edition), "suggestions.json")
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Suggestion[])
    : []
}

function editionPage(work: Work, edition: Edition): string {
  const text = readEditionText(work, edition)
  const flagged = text.passages.filter((p) => p.flags.some((f) => !f.accepted))
  const corrections = readCorrections(work, edition)
  const suggestions = readSuggestions(work, edition)
  const items = flagged.map((passage) => {
    const i = text.passages.indexOf(passage)
    const before = text.passages[i - 1]
    const after = text.passages[i + 1]
    const sameDivision = (p?: Passage) => p?.division === passage.division
    const open = passage.flags.filter((f) => !f.accepted)
    const archive = archiveOf(work, edition, passage)
    const suggested = open.flatMap((flag) =>
      suggestions.filter(
        (s) => s.locator === passage.locator && s.flag === flag.code,
      ),
    )
    const missing = open.map(missingNumber).find(Boolean)
    return `<section class="flagged" data-locator="${attr(passage.locator)}" data-start="${attr(passage.text.slice(0, 60))}">
<h2>${escapeHtml(passage.locator)}</h2>
${open.map((f) => `<p class="question">${escapeHtml(question(passage, f))}</p>`).join("")}
<p class="sources">Check against the source: ${sourceLinks(archive, passage, suggested[0]?.page)}</p>
${suggested.map(suggestionHtml).join("")}
${sameDivision(before) && before ? `<div class="context"><span>${escapeHtml(before.locator)} ends:</span>${blockHtml(before.blocks.at(-1) ?? "")}</div>` : ""}
<div class="passage-text" tabindex="0" aria-label="Text of ${attr(passage.locator)}">${passage.blocks.map((b) => blockHtml(b)).join("")}</div>
${sameDivision(after) && after ? `<div class="context"><span>${escapeHtml(after.locator)} begins:</span>${blockHtml(after.blocks[0] ?? "")}</div>` : ""}
<details class="actions"${suggested.length ? "" : " open"}><summary>${suggested.length ? "Answer differently" : "Answer from the source"}</summary>
<p class="hint">For an answer about a place in the text, first select the words there.</p>
<div class="row"><label>The source starts chapter <input name="newLocator" value="${attr(missing ? replaceLastNumber(passage.locator, missing) : nextLocator(passage.locator))}"></label><button data-op="split">at the words I selected</button></div>
<div class="row"><label>The source numbers this Passage <input name="renumberTo" value="${attr(passage.locator)}"></label><button data-op="renumber">Renumber to match</button></div>
<div class="row"><button data-op="merge">The source has no chapter break here: join it to the Passage before</button></div>
<div class="row"><label>The selected words onward are the translator’s, not the text. Title: <input name="title" value="${attr(`Translator’s essay after ${passage.locator}`)}"></label><button data-op="toEditorial">Move to Editorial matter</button></div>
<div class="row">${open
      .map(
        (f) =>
          `<label>The source is the same. Note: <input name="reason-${f.code}" value="${attr(acceptReason(f))}"></label><button data-op="accept" data-flag="${f.code}">Keep it as printed</button>`,
      )
      .join("")}</div>
</details>
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
<p>${escapeHtml(edition.slug)}: ${flagged.length ? `${flagged.length} Passages to check. Each Flag asks whether the imported text matches the printed source.` : "No Flags left. Run <code>pnpm build</code> and commit."}</p>
<p class="status" role="status" id="status"></p>
${history}
<div data-work="${attr(work.slug)}" data-edition="${attr(edition.slug)}" id="edition">${items.join("")}</div>`,
  )
}

/** What a Flag asks of the source. */
function question(passage: Passage, flag: Flag): string {
  const missing = missingNumber(flag)
  switch (flag.code) {
    case "gap":
      return /starts at/.test(flag.detail)
        ? `This division starts at ${passage.locator}. Does the source start it at chapter 1?`
        : `The numbering skips from ${passage.locator}. Does the source mark chapter ${missing ?? "?"} somewhere in this Passage?`
    case "duplicate":
      return `An earlier Passage is also numbered ${passage.locator}. What number does the source give this one?`
    case "long":
      return `${passage.locator} is unusually long (${flag.detail}). Is it this long in the source, or are chapter markers missing?`
  }
}

function acceptReason(flag: Flag): string {
  switch (flag.code) {
    case "gap":
      return "The source skips this number too"
    case "duplicate":
      return "The source repeats this number"
    case "long":
      return "The source has it as one long chapter"
  }
}

/** The number a gap Flag says is missing: 25 in "numbered 26, not 25". */
function missingNumber(flag: Flag): number | undefined {
  const match = flag.code === "gap" ? /, not (\d+)$/.exec(flag.detail) : null
  return match?.[1] ? Number(match[1]) : undefined
}

function replaceLastNumber(locator: string, n: number): string {
  return locator.replace(/\d+[a-z]?(?=(\([^)]*\))?$)/, String(n))
}

function suggestionHtml(suggestion: Suggestion): string {
  return `<div class="suggestion" data-corrections="${attr(JSON.stringify(suggestion.corrections))}">
<p><b>Suggested answer</b> (printed page ${suggestion.page}): ${escapeHtml(suggestion.finding)}</p>
<ul>${suggestion.corrections.map((c) => `<li>${escapeHtml(describeCorrection(c))}</li>`).join("")}</ul>
<button data-op="confirm">Confirm: the source says so</button>
</div>`
}

function describeCorrection(c: Correction): string {
  switch (c.op) {
    case "split":
      return `Start ${c.newLocator} at “${c.at}”`
    case "renumber":
      return `Renumber ${c.locator}${c.at ? ` (“${c.at}…”)` : ""} to ${c.newLocator}`
    case "merge":
      return `Join ${c.locator}${c.at ? ` (“${c.at}…”)` : ""} to the Passage before`
    case "replace":
      return `In ${c.locator}, replace “${c.find}” with ${c.with.split(/\s+/).length} words from the source`
    case "toEditorial":
      return `Move ${c.locator} from “${c.at}” to Editorial matter`
    case "accept":
      return `Keep ${c.locator} as printed: ${c.reason}`
  }
}

/** Links to the printed scan and the transcription, opened at this Passage where the site allows it. */
function sourceLinks(
  archive: IntakeArchive | undefined,
  passage: Passage,
  page?: number,
): string {
  const words = passage.text.split(/\s+/).slice(0, 6).join(" ")
  const links: string[] = []
  if (archive?.scan) {
    const href = page
      ? `${archive.scan}/page/${page}/mode/1up`
      : `${archive.scan}/mode/1up?q=${encodeURIComponent(`"${passage.text.split(/\s+/).slice(0, 4).join(" ")}"`)}`
    links.push(
      `<a href="${attr(href)}" target="_blank" rel="noopener">printed page${page ? ` ${page}` : ""} (scan)</a>`,
    )
  }
  const gutenberg = /gutenberg\.org\/ebooks\/(\d+)/.exec(archive?.url ?? "")
  if (gutenberg?.[1]) {
    const fragment = encodeURIComponent(words).replace(/-/g, "%2D")
    links.push(
      `<a href="https://www.gutenberg.org/cache/epub/${gutenberg[1]}/pg${gutenberg[1]}-images.html#:~:text=${fragment}" target="_blank" rel="noopener">transcription</a>`,
    )
  } else if (archive?.url) {
    links.push(
      `<a href="${attr(archive.url)}" target="_blank" rel="noopener">transcription</a>`,
    )
  }
  return links.length ? links.join(" · ") : "no source link recorded"
}

const archiveTexts = new Map<string, string>()

/** The archive whose text holds this Passage, for an Edition that spans several volumes. */
function archiveOf(
  work: Work,
  edition: Edition,
  passage: Passage,
): IntakeArchive | undefined {
  const archives = edition.source.archives
  if (archives.length < 2) return archives[0]
  const probe = squash(passage.text.slice(0, 80))
  return archives.find((archive) => {
    const key = `${work.slug}/${edition.slug}/${archive.file}`
    let text = archiveTexts.get(key)
    if (text === undefined) {
      text = squash(readIntakeHtml(archive)("body").text())
      archiveTexts.set(key, text)
    }
    return text.includes(probe)
  })
}

function squash(text: string): string {
  return text.replace(/[^\p{L}\p{N}]+/gu, " ").trim()
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
  change: { add?: Correction[]; undo?: boolean },
): string {
  const file = correctionsFile(work, edition)
  const previous = readCorrections(work, edition)
  const next = change.undo
    ? previous.slice(0, -1)
    : [...previous, ...(change.add ?? [])]
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
    if (url.pathname === "/site.js")
      return send(200, "text/javascript", SITE_JS)
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
            corrections?: Correction[]
            undo?: boolean
          }
          const { work, edition } = find(body.work, body.edition)
          send(
            200,
            "text/plain",
            applyCorrection(work, edition, {
              add:
                body.corrections ??
                (body.correction ? [body.correction] : undefined),
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
.question { font-size: 1.15rem; margin: 0.25rem 0; }
.sources { font-size: 1rem; color: var(--muted); }
.suggestion { border: 1px solid var(--accent); border-radius: 6px; padding: 0.5rem 1rem; margin: 1rem 0; font-size: 1rem; }
.suggestion ul { margin: 0.25rem 0 0.75rem; }
.actions summary { cursor: pointer; color: var(--muted); }
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
  if (op === "confirm") return send({ corrections: JSON.parse(button.closest(".suggestion").dataset.corrections) });
  const section = button.closest(".flagged");
  const locator = section.dataset.locator;
  const field = (name) => section.querySelector('input[name="' + name + '"]').value.trim();
  if (op === "accept") {
    const reason = field("reason-" + button.dataset.flag);
    if (!reason) { status.textContent = "Say what the source shows before keeping it."; return; }
    return send({ correction: { op, locator, flag: button.dataset.flag, reason } });
  }
  if (op === "merge") return send({ correction: { op, locator, at: section.dataset.start } });
  // The opening words pick out this Passage when another shares its Locator.
  if (op === "renumber") return send({ correction: { op, locator, at: section.dataset.start, newLocator: field("renumberTo") } });
  const at = selectionIn(section);
  if (!at) { status.textContent = "First select the words in " + locator + " where it should be cut."; return; }
  if (op === "split") return send({ correction: { op, locator, at, newLocator: field("newLocator") } });
  if (op === "toEditorial") return send({ correction: { op, locator, at, title: field("title") } });
});
`
