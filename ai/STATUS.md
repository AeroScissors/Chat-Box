# Status

**Last updated:** 2026-09-14 (knowledge sources + pdf2json + llama3 tuning; pushed to GitHub)

**Repo:** https://github.com/AeroScissors/Chat-Box — local folder initialised as a git repo on 2026-09-14 on top of the remote `main` and pushed (`ea8188d`). `server/policies/*` is gitignored except the sample handbook (company documents stay local).

**State:** v0.1.0 widget + server-side company knowledge base. Proxy answers policy questions from three mergeable sources — `server/policies.json`, documents in `server/policies/` (`.pdf/.txt/.md`, or `.json` produced by `npm run pdf2json`), and optionally MySQL tables (`DB_URL`) — and chats normally otherwise. Build, tests (56), lint, typecheck green. Verified end-to-end in Chrome with a real 39-page IT security policy PDF and with 10 natural-language "office worker" questions (8/10 fully correct with section citations; see CHANGELOG).

**How it is run right now (dev box):** Ollama with `llama3:latest` (8B; chosen over `gemma3-12b` for speed: first token ~3 s, answers 5-20 s). Sample `policies.json` disabled because it conflicts with the real PDF:

```
KNOWLEDGE_FILE=none COMPANY_NAME="Example Company" ASSISTANT_NAME="Example Company Assistant" MODEL=llama3:latest npm run proxy
```

Demo at `http://localhost:5174/demo/index.html` (Vite; 5173 was occupied). Direct Ollama mode (Mode A) still needs a `model` attribute.

**Recommended knowledge workflow:** `npm run pdf2json -- server/policies/<doc>.pdf` → review the generated JSON (titles, content) → add hand-written `keywords` with the phrases employees actually use (`"dr"`, `"sla"`, `"leaving the company"`, `"spotify"`) → keep the JSON in `server/policies/` (hot-reloaded; the PDF next to it is skipped). Keep one source of truth per topic — two sources with different numbers get blended by the model.

**Security posture (proxy):** hardened against client system-message override, fake policy-update injection, forged assistant history (now folded into one labelled user turn), flooding, policy enumeration; `<<<`/`>>>` markers stripped from output. Residual: prompt defenses are model-dependent (llama3-8B occasionally cites the wrong sub-clause of a long section); server-side sessions would be the structural fix for forged history; `AUTH_TOKEN` is a stop-gap, real deployments need SSO/session checks.

**Not verified:** MySQL source (`server/db.mjs`) — only config validation and graceful ECONNREFUSED tested; no MySQL/phpMyAdmin server was available.

**Known limitations / follow-ups (not blocking):**
- Retrieval is keyword-based (+ synonym map + derived keywords). Questions phrased with words the document never uses can miss the section; the model then tends to invent a citation. Structural fix: embedding retrieval via Ollama `all-minilm` (45 MB) as a hybrid — proposed, awaiting go-ahead.
- Topics the document does not cover get generic advice instead of an explicit "not in the policy" — prompt asks for it, 8B model only half-complies.
- Long sections (e.g. §2 Password Policy, 4 KB) reduce citation precision; splitting at 2-level numbered sub-headings ending in ":" would help.
- Heading detection for PDFs is heuristic; oddly formatted PDFs fall back to ~1500-char chunks.
- DB rows are loaded in full (`DB_MAX_ROWS` cap) rather than queried per question.
- Widget: minimal Markdown (no tables/images), no syntax highlighting, resize not persisted, only bottom-right/left positions.
