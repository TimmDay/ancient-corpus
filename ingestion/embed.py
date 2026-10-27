#!/usr/bin/env python3
"""Embed normalized corpus passages and upsert them into the shared Supabase
project's ``corpus_passages`` table (used by the ``somnus-data-ingestion``
admin app for retrieval-grounded form autofill).

Reads a normalized JSONL file (one record per passage, as produced by an
importer under ``ingestion/importers/``), embeds each passage's text with
Voyage AI, and upserts rows keyed on ``corpus_uri``.

Requires environment variables (stdlib-only script -- no ``requests``/
``python-dotenv`` installed in this repo; either export these yourself or
run with ``export $(grep -v '^#' .env | xargs) && python3 ingestion/embed.py``):

- ``VOYAGE_API_KEY``
- ``SUPABASE_URL`` (e.g. ``https://<project-ref>.supabase.co``)
- ``SUPABASE_SERVICE_ROLE_KEY`` (never the anon key -- this writes data)

Prerequisite: a row for the work must already exist in the ``sources``
table (create it via the somnus-data-ingestion admin UI, or the SQL handoff
script) with ``work_title`` matching ``--work-title`` exactly. This script
looks that row up by title rather than taking a source id, so it fails
loudly if the source row hasn't been created yet.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = "voyage-4"
EMBEDDING_DIMENSION = 1024
BATCH_SIZE = 64  # well under Voyage's 1000-texts/320K-token request caps


def env_or_die(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Missing required environment variable: {name}", file=sys.stderr)
        sys.exit(1)
    return value


def http_json(
    url: str, *, method: str = "GET", headers: dict[str, str], body: Any = None
) -> Any:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        print(f"HTTP {error.code} from {url}: {detail}", file=sys.stderr)
        raise


def embed_batch(texts: list[str], api_key: str) -> list[list[float]]:
    response = http_json(
        VOYAGE_EMBEDDINGS_URL,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        body={
            "input": texts,
            "model": VOYAGE_MODEL,
            "input_type": "document",
            "output_dimension": EMBEDDING_DIMENSION,
        },
    )
    ordered = sorted(response["data"], key=lambda item: item["index"])
    return [item["embedding"] for item in ordered]


def find_source_id(work_title: str, supabase_url: str, service_role_key: str) -> int:
    query = urllib.parse.quote(work_title)
    url = f"{supabase_url}/rest/v1/sources?work_title=eq.{query}&select=id"
    rows = http_json(
        url,
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
        },
    )
    if not rows:
        print(
            f"No `sources` row found with work_title={work_title!r}. "
            "Create it first (via the somnus-data-ingestion Sources admin "
            "page, or the schema handoff SQL) before running this script.",
            file=sys.stderr,
        )
        sys.exit(1)
    return rows[0]["id"]


def upsert_passages(
    rows: list[dict[str, Any]], supabase_url: str, service_role_key: str
) -> None:
    url = f"{supabase_url}/rest/v1/corpus_passages?on_conflict=corpus_uri"
    http_json(
        url,
        method="POST",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body=rows,
    )


def slugify_work(work_key: str) -> str:
    # "suetonius-twelve-caesars" -> "suetonius/twelve-caesars"
    parts = work_key.split("-", 1)
    return "/".join(parts) if len(parts) == 2 else work_key


def build_corpus_uri(record: dict[str, Any]) -> str:
    work_path = slugify_work(record["work_key"])
    life = record["life"].lower()
    return f"{work_path}/{life}/{record['chapter']}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "data"
        / "normalized"
        / "suetonius-twelve-caesars.jsonl",
    )
    parser.add_argument(
        "--work-title",
        default="The Lives of the Twelve Caesars",
        help="Must exactly match an existing `sources.work_title` row (default: %(default)s)",
    )
    parser.add_argument(
        "--skip-flagged",
        action="store_true",
        help="Skip records with flagged_long or flagged_gap set (chapters awaiting manual review -- see the importer's docstring)",
    )
    args = parser.parse_args()

    voyage_api_key = env_or_die("VOYAGE_API_KEY")
    supabase_url = env_or_die("SUPABASE_URL").rstrip("/")
    service_role_key = env_or_die("SUPABASE_SERVICE_ROLE_KEY")

    records = [json.loads(line) for line in args.input.open(encoding="utf-8")]
    if args.skip_flagged:
        before = len(records)
        records = [
            r
            for r in records
            if not r.get("flagged_long") and not r.get("flagged_gap")
        ]
        print(f"Skipping {before - len(records)} flagged record(s) (--skip-flagged)")

    source_id = find_source_id(args.work_title, supabase_url, service_role_key)
    print(f"Resolved source_id={source_id} for {args.work_title!r}")

    total = 0
    for start in range(0, len(records), BATCH_SIZE):
        batch = records[start : start + BATCH_SIZE]
        embeddings = embed_batch([r["text"] for r in batch], voyage_api_key)

        rows = [
            {
                "source_id": source_id,
                "section_label": record["life"],
                "locator": str(record["chapter"]),
                "citation": record["citation"],
                "corpus_uri": build_corpus_uri(record),
                "text": record["text"],
                "ordinal": record["ordinal"],
                "embedding": embedding,
            }
            for record, embedding in zip(batch, embeddings)
        ]
        upsert_passages(rows, supabase_url, service_role_key)
        total += len(rows)
        print(f"Upserted {total}/{len(records)}")

    print(f"Done. {total} passages embedded and upserted.")


if __name__ == "__main__":
    main()
