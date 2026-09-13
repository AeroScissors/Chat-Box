# Changelog

## 2026-09-13 — Plain-English integration guide + AI integration prompt
- Added `INTEGRATION.md`: 5-step non-technical guide (get file → two lines → choose A/B/C → customise → control), collapsible recipes for HTML/PHP/Django/Laravel/Rails, React, Next.js, Vue/Nuxt, Angular, WordPress, site builders; knowledge-base how-to; go-live checklist; troubleshooting table.
- README: linked the guide at the top and added "Let an AI integrate it for you" — a self-contained prompt (embedding lines, attributes, provider protocols, API/events, framework caveats, security rules, and the tasks to perform) for Claude Code / Cursor / ChatGPT users.

## 2026-09-13 — Proxy hardening after prompt-injection review
- Probed the running proxy: system-prompt extraction, client `system` override, fake "policy update" injection, forged assistant history, keyword stuffing, off-topic compute abuse, parallel flood, open `/api/policies`. Fake-update injection and forged history succeeded; no rate limit; policies listable from any origin.
- Fixes in `server/proxy.mjs`: drop client `system` messages; require trailing `user` turn; demote client assistant turns to unverified quoted context; per-IP rate limit (`RATE_LIMIT`) + concurrency cap (`MAX_CONCURRENT`) → 429; optional `AUTH_TOKEN` bearer auth via `authorize()`; `/api/policies` gated by `EXPOSE_POLICIES`; `SCOPE=policies-only` canned reply without model call; retrieval uses last two user turns; `TRUST_PROXY` for XFF.
- `server/knowledge.mjs`: hardened system prompt (security rules, `<<<POLICIES>>>` fencing, no policy changes via chat, no instruction disclosure) + trailing `reminder()` system message.
- Re-tested: all probes now refused/corrected; multi-turn follow-ups still work; burst → 4×200 then 429s. README gained a "Threat model" section with residual risks.

## 2026-09-13 — Company knowledge base (policies)
- Added `server/policies.json` (15 sample policies: security, company, database) and `server/knowledge.mjs` (keyword/overlap retrieval, hot reload, system-prompt builder).
- Proxy now injects matching policies as a system prompt per request; unmatched questions fall through to normal chat. New `GET /api/policies`; `/health` reports policy count; `KNOWLEDGE_FILE` env (path or `none`).
- Demo now defaults to the proxy (`provider="custom"`, `http://localhost:8787/api/chat`) with an "Example Company Assistant" title so policy Q&A works out of the box.
- Verified in Chrome: password-policy and prod-DB-access questions answered from policy text; unrelated question ("pet goldfish name") answered normally.

## 2026-09-13 — v0.1.0 initial implementation
- Scaffolded Vite + strict TypeScript + ESLint/Prettier + Vitest project (no runtime deps).
- Added `<ai-chat-widget>` custom element with Shadow DOM, launcher, header, message list, composer, themes, animations, reduced-motion, mobile sheet.
- Added `LLMProvider` abstraction with Ollama (NDJSON), OpenAI-compatible (SSE) and Custom API providers; shared timeout/abort + error mapping; pure streaming parsers.
- Added `ChatStore`, config resolution/validation (attributes, `window.ChatWidgetConfig`, `setConfig`), localStorage persistence (messages only).
- Added safe DOM-building Markdown renderer with link scheme allowlist and code-block copy buttons.
- Added demo host site (`demo/index.html`) with hostile global CSS and live config controls; `demo/dist-embed.html` for the built bundle.
- Added `server/proxy.mjs` reference backend (Mode B) with CORS/model allowlists and normalised SSE.
- Added 56 tests (parsers, providers, store, storage, config, markdown, element behaviour).
- Fixed during verification: autolink infinite recursion, swallowed custom-API error objects, silent stream end on abort, empty URL passing validation, `[hidden]` overridden by display rules, mobile panel clipped by resizable max-width, rAF-only batching/focus stalling in hidden tabs, error message wording.
- Wrote README and `/ai` docs.
