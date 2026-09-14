# Tasks

## Definition of Done (spec §33)
- [x] Floating bottom-right button
- [x] Open/close animation
- [x] Chat window
- [x] User messages
- [x] Assistant messages
- [x] Typing indicator
- [x] Streaming responses
- [x] Stop generation
- [x] Markdown
- [x] Code blocks
- [x] Copy code
- [x] Responsive mobile UI
- [x] Dark/light/system themes
- [x] Shadow DOM isolation
- [x] Accessibility
- [x] Conversation state
- [x] Optional persistence
- [x] Provider abstraction
- [x] Ollama provider
- [x] Ollama streaming
- [x] OpenAI-compatible provider
- [x] Custom API provider
- [x] Configuration API
- [x] Public widget methods
- [x] Useful events
- [x] Error handling
- [x] Security considerations
- [x] Production bundle
- [x] Framework-independent embedding
- [x] Demo host website
- [x] Tests
- [x] README

## Knowledge base (2026-09-13 / 2026-09-14)
- [x] policies.json with security / company / database policies
- [x] PDF / txt / md policy documents folder (`server/policies/`, pdf-parse, heading split, hot reload)
- [x] MySQL source (`DB_URL`, policy table + arbitrary tables as records, read-only, periodic refresh)
- [x] `npm run pdf2json` — one-time PDF → editable policies JSON; `.json` in `server/policies/` loaded verbatim, same-named PDF skipped
- [x] Derived keywords (acronyms, corpus-common words filtered), query synonyms, previous-turn top-up
- [x] Conversational prompt with plain-text citations; no-inference rule; `<<<`/`>>>` stripped from output
- [x] llama3-safe message packaging (history folded into one user turn, reminder inside it)
- [x] Real-PDF test (iCIMS IT Security Policy) + 10 natural-language questions in Chrome/API
- [ ] Verify MySQL source against a real phpMyAdmin/XAMPP database (none was running when implemented)
- [ ] Embedding retrieval (Ollama `all-minilm`, hybrid with keyword score) — needs `ollama pull all-minilm` (user go-ahead)
- [ ] Explicit "not covered by policy" reply when retrieved sections do not answer the question
- [ ] Split long sections at 2-level numbered sub-headings ("2.2. …:") for better citation precision
- [x] Retrieval + system-prompt injection in proxy; normal chat fallback
- [x] Demo defaults to proxy; verified in browser

## Security review (2026-09-13)
- [x] Probe proxy with injection/abuse attacks
- [x] Drop client system messages; demote client assistant turns
- [x] Anti-injection system prompt + trailing reminder
- [x] Rate limit + concurrency cap + optional bearer auth + gated /api/policies + policies-only scope
- [x] Document threat model and residual risks

## Documentation (2026-09-13)
- [x] INTEGRATION.md plain-English guide with framework recipes
- [x] README "Let an AI integrate it for you" prompt

## Repo (2026-09-14)
- [x] git init on top of `origin/main`, `.gitattributes` (`*.pdf binary`), gitignore `server/policies/*` except sample
- [x] Pushed `ea8188d` to https://github.com/AeroScissors/Chat-Box

## Backlog (optional)
- [ ] Server-side sessions (store transcript; client sends only new message) — structural fix for forged history
- [ ] SSO/session-based `authorize()` for internal deployments
- [ ] Outbound link allow-list in proxy responses
- [ ] Store conversations in a database (SQLite via `node:sqlite`) for audit
- [ ] Markdown tables / images (images need a URL policy)
- [ ] Optional syntax highlighting hook (`onCodeBlock` already exposed)
- [ ] Persist user-resized window size
- [ ] Top positions / custom offsets via attributes (CSS vars already work)
