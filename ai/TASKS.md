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

## Knowledge base (2026-09-13)
- [x] policies.json with security / company / database policies
- [x] PDF / txt / md policy documents folder (`server/policies/`, pdf-parse, heading split, hot reload)
- [x] MySQL source (`DB_URL`, policy table + arbitrary tables as records, read-only, periodic refresh)
- [ ] Verify MySQL source against a real phpMyAdmin/XAMPP database (none was running when implemented)
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

## Backlog (optional)
- [ ] Server-side sessions (store transcript; client sends only new message) — structural fix for forged history
- [ ] SSO/session-based `authorize()` for internal deployments
- [ ] Outbound link allow-list in proxy responses
- [ ] Embedding-based retrieval (e.g. via Ollama `/api/embeddings`) instead of keyword scoring
- [ ] Store conversations in a database (SQLite via `node:sqlite`) for audit
- [ ] Markdown tables / images (images need a URL policy)
- [ ] Optional syntax highlighting hook (`onCodeBlock` already exposed)
- [ ] Persist user-resized window size
- [ ] Top positions / custom offsets via attributes (CSS vars already work)
