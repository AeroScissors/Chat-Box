# Status

**Last updated:** 2026-09-14 (PDF documents + MySQL knowledge sources)

**State:** v0.1.0 + company knowledge base. Proxy answers security/company/database questions from `server/policies.json`, PDF/txt/md files in `server/policies/` (pdf-parse) and optionally MySQL tables (`DB_URL`, mysql2), and chats normally otherwise; demo defaults to the proxy. v0.1.0 core complete — all Definition-of-Done items implemented and verified (see `ai/TASKS.md`). Build, tests (56), lint, typecheck all green. Verified end-to-end in Chrome against a real local Ollama instance in all three provider modes.

**Environment notes:** Ollama running locally with `llama3:latest` (8B, current) and `gemma3-12b:latest`. Run the proxy with `KNOWLEDGE_FILE=none COMPANY_NAME="Example Company" ASSISTANT_NAME="Example Company Assistant" MODEL=llama3:latest npm run proxy` (sample policies.json disabled — it conflicts with the real PDF) (the proxy decides the model; the demo leaves `model` empty). Direct Ollama mode (Mode A) still needs a `model` attribute.

**Security posture (proxy):** hardened against client system-message override, fake policy-update injection, forged assistant history, flooding, and policy enumeration (see README → Threat model). Residual: prompt defenses are model-dependent; server-side sessions would be the structural fix for forged history; `AUTH_TOKEN` is a stop-gap, real deployments need SSO/session checks.

**Knowledge sources (2026-09-14):** Recommended workflow: `npm run pdf2json -- <pdf>` → edit keywords in the JSON → keep in `server/policies/`. PDF path verified end-to-end with the sample handbook and with a real 39-page IT security policy PDF (52 sections; questions answered correctly in Chrome — see CHANGELOG 2026-09-14). MySQL path implemented (`server/db.mjs`) and verified only for config validation + graceful ECONNREFUSED — no MySQL server was available; needs a real phpMyAdmin DB test. Runtime deps added: `pdf-parse`, `mysql2` (both lazily imported).

**Known limitations / follow-ups (not blocking):**
- Retrieval is keyword-based; questions phrased with words the document never uses can miss the right section (small synonym map helps). Embedding-based retrieval (e.g. Ollama `nomic-embed-text`) would be the structural fix.
- Heading detection for PDFs is heuristic; oddly formatted PDFs fall back to ~1500-char chunks (still searchable, less precise titles).
- DB rows are loaded in full (`DB_MAX_ROWS` cap) rather than queried per question; large tables need a smaller cap or a filtered view.
- Markdown renderer is intentionally minimal (no tables, images, task lists, footnotes).
- No syntax highlighting in code blocks (would add a dependency).
- Window resize (desktop) uses native CSS `resize`; size isn't persisted.
- Only `bottom-right` / `bottom-left` positions.
