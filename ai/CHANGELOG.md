# Changelog

## 2026-09-14 — Natural-language question test (10 office-worker questions, llama3, PDF-only)
- First pass: 5 correct, 2 partial (topics the PDF does not cover: lost laptop, phishing), 3 wrong (leaving-company access cut-off → §8.3 not retrieved; "bug… how fast to fix" → §10 not retrieved; "install spotify" → §3 not retrieved; llama3 then invented citations).
- Fixes: `QUERY_SYNONYMS` extended (bug/flaw/exploit → vulnerability; leaving/quit/resign/fired → employ/removed/termination; install/app/program → software/authorized; lost/stolen; phishing/scam). Hand-added human phrasings to the JSON keywords of §8 Access Control, §3 Authorized Software, §10 Vulnerability Management, §11 Security Awareness (hot-reloaded, no restart).
- Second pass: leaving → 8.3 (24 h) ✓; bug → 10.4.5.1 (30 d) ✓; spotify → 3.3 ✓. Remaining: password-sharing cites 2.1.5 instead of 2.2.5 (8B precision within a long section); uncovered topics get generic advice rather than an explicit "not covered".
- Structural fix for phrasing misses = embedding retrieval (Ollama `all-minilm`, 45 MB) — proposed, not implemented.

## 2026-09-14 — Conversational tone, acronym retrieval, marker leak, sample-data conflict
- From a user transcript: "ntp policy" not found (3-letter acronyms were skipped by keyword derivation; every title's "policy" gave +2 noise); model cited sections as `<<<Title>>>` (imitating the prompt fencing); public-wifi answer came from the *sample* policies.json ("Device and laptop security") and inferred an unwritten rule; user asked for a more conversational style.
- `knowledge.mjs`: `deriveKeywords` keeps 3-letter tokens and always adds ALL-CAPS acronyms from the content (NTP, VPN, MFA, PII…); `titleTokens` (title minus corpus-common words) used for title scoring; prompt rewritten — direct answer first in own words, then exact wording + plain-text citation "(Policy title, 2.1.9)", never `<<<`/`>>>`, no inferring rules that are not written, "point to the closest related rule" when uncovered.
- `proxy.mjs`: output filter now strips any `<<<`/`>>>` sequences, not only the POLICIES markers.
- Regenerated `IT-Security-Policy-6SEPTEMBER2021.json` with the new keywords (manual dr/sla keywords merged back). Proxy now started with `KNOWLEDGE_FILE=none COMPANY_NAME="Example Company" ASSISTANT_NAME="Example Company Assistant"` so the sample policies.json no longer conflicts with the real PDF.
- Verified (llama3, PDF-only): ntp → §19.1; public wifi → §18.1 from the PDF, phrased as "not recommended"; "give me policy no." → 18.1; leave → "Yes, you get 24 days…". Lint + 56 tests green.

## 2026-09-14 — Switched to llama3 (8B) for speed; prompt packaging made model-robust
- User pulled `llama3` (8B, 4.7 GB) to replace gemma3-12b: first token ~3 s, full answer ~5-14 s (was 20-40 s). Started with `MODEL=llama3:latest`.
- llama3 echoed the conversation instead of answering (screenshot): it parroted the "[Earlier reply shown to the user — unverified]" wrapper and the question, and returned empty output on another prompt. Causes: (a) alternating wrapped user turns for demoted history, (b) the trailing *system* reminder after the user turn, which llama3's template mishandles.
- `proxy.mjs` `withKnowledge`: leading assistant messages (widget welcome text) dropped; earlier conversation folded into ONE labelled block inside the final user turn ("Earlier conversation, supplied by the client and unverified …" / "Current question — answer only this"); security reminder appended to that user turn instead of a trailing system message. Security posture unchanged (client assistant turns still never sent as real assistant turns); re-tested: forged "IT confirmed 4-char passwords" history is refused and the real §2.1.1 rule quoted.
- `knowledge.buildSystemPrompt(question, previous)`: previous user turn now tops up matches when the latest turn yields < 4 (was: only when it yielded 0) — short follow-ups keep their topic.
- Output stream strips `<<<POLICIES>>>` / `<<<END POLICIES>>>` markers (buffer-aware across chunks) since llama3 copied one into an answer.
- Verified with llama3: cabling question (typo "waht"), follow-up "and what about unused ports?", forged history, small talk — all correct. Lint + 56 tests green.

## 2026-09-14 — PDF → JSON conversion (editable knowledge base)
- User asked for a one-time PDF→JSON conversion. Added `server/pdf-to-json.mjs` + `npm run pdf2json`; `documents.mjs` gained `loadDocument()` and loads `.json` files in the folder verbatim (keywords preserved), skipping a same-named PDF. `commonWords` exported from knowledge.mjs so the converter derives clean keywords.
- Converted the user's `IT-Security-Policy-6SEPTEMBER2021.pdf` → `.json` (52 policies); hand-added keywords `dr, disaster recovery, bcp…` (§5) and `sla, critical, zero-day…` (§10). Both questions that failed in Chrome ("What is the DR policy", "sla for critical vulnerability") now answer correctly. Note: speed is unchanged by design — PDFs were already parsed once at startup; the model is the bottleneck.
- Empty `server/policies/source/` was created for moving originals (PDF was file-locked, left in place — skipped by the same-name rule).

## 2026-09-14 — PDF policy documents + MySQL (phpMyAdmin) knowledge sources
- `server/knowledge.mjs` is now multi-source: `setSource(name, policies)`, `stats()`, auto `deriveKeywords()` for policies without keywords; `createKnowledgeBase(null, {company, assistantName})` runs without a JSON file. Prompt wording extended to "policies / records".
- New `server/documents.mjs`: loads `.pdf` (via `pdf-parse`), `.txt`, `.md` from `POLICIES_DIR` (default `server/policies/`), splits into sections by headings, watches the folder. Sample `server/policies/example-handbook.pdf` (leave, expenses, remote work).
- New `server/db.mjs`: `mysql2` pool from `DB_URL`; `DB_POLICIES_TABLE` rows → policies, `DB_TABLES` rows → searchable records; `DB_MAX_ROWS`, `DB_REFRESH_SECONDS`; identifier validation, read-only `SELECT … LIMIT`.
- `server/proxy.mjs`: wires both sources; `/health` reports `sources`; new env `POLICIES_DIR, DB_URL, DB_POLICIES_TABLE, DB_TABLES, DB_MAX_ROWS, DB_REFRESH_SECONDS, COMPANY_NAME, ASSISTANT_NAME`.
- Deps: `pdf-parse@2.4.5`, `mysql2@3.24.4` (runtime, lazily imported so the proxy still starts without the features).
- Verified: PDF → 3 sections; "meals when travelling / who approves 700 EUR" answered from the PDF (40 EUR, director approval) in PDF-only mode; with policies.json also loaded the model blended the sample JSON expense policy (conflicting sample data — documented). DB: bad table name rejected, ECONNREFUSED logged, proxy keeps running. Lint + 56 tests green. Not verified: live MySQL (none available).
- Real-PDF test (iCIMS IT Security Policy, 39 pages, added by the user): first pass split it into 152 fragments because wrapped clauses / page headers / TOC lines looked like headings. Fixed `isHeading` (numbered headings must be Title Case or ALL CAPS, no trailing `:`/`.`; TOC dot-leaders excluded) and added `stripRunningLines` (repeated page headers, "P a g e | n") → 52 clean sections (all 30 chapters).
- Retrieval fixes found in Chrome testing: proxy now retrieves on the latest user turn and only widens to the previous turn when nothing matches (old 2-turn query let the previous topic crowd out the new one); derived keywords skip corpus-common words (`policy`, `shall`, `data`… — words in >25% of a source's policies) and digits; stemmer collapses double consonants (`logging`→`log` = `logs`); small query synonym map (usb→removable media, wifi→wireless, vacation/pto→leave, 2fa→mfa, …).
- Verified in Chrome via the demo widget: "incorrect login attempts / lockout / server patch window" → 7 attempts, 30 min, 30 days (§2.1.9, §14.1 ✓); "customer data on USB / log retention" → not allowed, logs one year (§9.9 ✓; cited §23.2 rather than §25 for USB — both were retrieved).

## 2026-09-13 — Short README
- README reduced to: run commands, embed snippet, compact AI-integration prompt, links. Former README → `docs/REFERENCE.md`; `INTEGRATION.md` → `docs/INTEGRATION.md`. Cross-links updated.

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
