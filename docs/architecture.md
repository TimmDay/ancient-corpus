# Initial Architecture

The corpus is an independent, versioned service. It owns source provenance, normalized passage records, citation identity, search, and human-readable passage pages.

```text
Raw source artifacts
        |
Ingestion and validation
        |
Normalized corpus + search indexes
        |
Corpus service
  |          |          |
HTTP API   HTML pages   MCP adapter
  |                     |
Chatbot and other applications
```

The MCP application is a thin adapter and does not own a separate copy of the corpus or its retrieval logic. The chatbot uses the same canonical passage IDs and citation URLs as every other client.

Raw and generated corpus data lives outside ordinary Git. Git tracks importers, schemas, manifests, checksums, migrations, small fixtures, tests, and documentation.

