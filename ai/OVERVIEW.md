# Overview

**Product:** `<ai-chat-widget>` — an embeddable, framework-agnostic AI chat widget distributed as a single JS bundle (`dist/chat-widget.js`). Built with TypeScript, Custom Elements, Shadow DOM, Vite. Zero runtime dependencies.

**Capabilities:** floating launcher, animated chat window, streaming responses with stop, safe Markdown + code copy, three LLM providers (Ollama, OpenAI-compatible, custom backend), themes (light/dark/system), responsive mobile sheet, accessibility, conversation state with retry/clear, optional localStorage persistence, public JS API + events.

**Deployment modes:**
- Mode A — browser → Ollama directly (local/dev; subject to `OLLAMA_ORIGINS` CORS).
- Mode B — browser → your proxy (`server/proxy.mjs` reference) → Ollama/OpenAI. Recommended for third-party sites.

**Knowledge base:** `server/policies.json`, documents in `server/policies/` (`.pdf/.txt/.md`, or `.json` from `npm run pdf2json` — the recommended, editable form), and optionally MySQL tables (`DB_URL`, the phpMyAdmin database) are merged and retrieved per question (keyword scoring + derived keywords + synonyms) by the proxy and injected into the system prompt, so the assistant answers policy questions from the handbook with section citations and chats normally otherwise. Everything runs locally (Ollama); no cloud, no cost. Current dev model: `llama3` 8B.

**Repo:** https://github.com/AeroScissors/Chat-Box (`main`).

**Key docs:** `README.md` (short: commands + embed snippet + AI integration prompt), `docs/INTEGRATION.md` (plain-English how-to + framework recipes), `docs/REFERENCE.md` (full technical reference), `ai/ARCHITECTURE.md`, `ai/API.md`, `ai/PIPELINE.md`, `ai/STATUS.md`, `ai/TASKS.md`, `ai/CHANGELOG.md`.
