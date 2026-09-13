# Status

**Last updated:** 2026-09-13 (integration guide + AI prompt added)

**State:** v0.1.0 + company knowledge base. Proxy answers security/company/database questions from `server/policies.json` and chats normally otherwise; demo defaults to the proxy. v0.1.0 core complete — all Definition-of-Done items implemented and verified (see `ai/TASKS.md`). Build, tests (56), lint, typecheck all green. Verified end-to-end in Chrome against a real local Ollama instance in all three provider modes.

**Environment notes:** Ollama running locally with `qwen2.5-coder:7b-instruct`. Run the proxy with `MODEL=qwen2.5-coder:7b-instruct npm run proxy` (the proxy decides the model; the demo leaves `model` empty). Direct Ollama mode (Mode A) still needs a `model` attribute.

**Security posture (proxy):** hardened against client system-message override, fake policy-update injection, forged assistant history, flooding, and policy enumeration (see README → Threat model). Residual: prompt defenses are model-dependent; server-side sessions would be the structural fix for forged history; `AUTH_TOKEN` is a stop-gap, real deployments need SSO/session checks.

**Known limitations / follow-ups (not blocking):**
- Markdown renderer is intentionally minimal (no tables, images, task lists, footnotes).
- No syntax highlighting in code blocks (would add a dependency).
- Window resize (desktop) uses native CSS `resize`; size isn't persisted.
- Only `bottom-right` / `bottom-left` positions.
