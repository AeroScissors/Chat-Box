# Overview

**Product:** `<ai-chat-widget>` — an embeddable, framework-agnostic AI chat widget distributed as a single JS bundle (`dist/chat-widget.js`). Built with TypeScript, Custom Elements, Shadow DOM, Vite. Zero runtime dependencies.

**Capabilities:** floating launcher, animated chat window, streaming responses with stop, safe Markdown + code copy, three LLM providers (Ollama, OpenAI-compatible, custom backend), themes (light/dark/system), responsive mobile sheet, accessibility, conversation state with retry/clear, optional localStorage persistence, public JS API + events.

**Deployment modes:**
- Mode A — browser → Ollama directly (local/dev; subject to `OLLAMA_ORIGINS` CORS).
- Mode B — browser → your proxy (`server/proxy.mjs` reference) → Ollama/OpenAI. Recommended for third-party sites.

**Knowledge base:** `server/policies.json` (security / company / database policies) is retrieved per question by the proxy and injected into the system prompt, so the assistant answers policy questions from the handbook and chats normally otherwise.

**Key docs:** `INTEGRATION.md` (plain-English how-to + framework recipes), `README.md` (technical reference incl. AI integration prompt), `ai/ARCHITECTURE.md`, `ai/API.md`, `ai/PIPELINE.md`, `ai/STATUS.md`, `ai/TASKS.md`, `ai/CHANGELOG.md`.
