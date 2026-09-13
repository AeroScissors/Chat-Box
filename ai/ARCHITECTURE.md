# Architecture

```
UI → Chat State → Config → LLM Provider → Streaming parsers
```

| Layer | Files | Responsibility |
| --- | --- | --- |
| Entry | `src/index.ts` | Registers the element, exports public types/classes, `window.AIChatWidget` in IIFE |
| Element | `src/components/ai-chat-widget.ts` | `AIChatWidgetElement`: shadow root, config resolution, orchestration of store/provider/storage, public methods, events |
| UI parts | `chat-header.ts`, `chat-messages.ts`, `chat-input.ts`, `floating-button.ts`, `icons.ts` | Plain classes owning a DOM subtree (not separate custom elements — avoids polluting the global registry) |
| State | `src/state/chat-store.ts` | `ChatStore`: immutable snapshots, `subscribe`, add/append/status/remove/clear, wire-format `getConversation()` |
| Config | `src/config/config.ts` | `WidgetConfig` defaults, attribute↔key map, coercion, `resolveConfig(global, attrs, js)`, `validateConfig`, `toProviderConfig` |
| Providers | `src/providers/*` | `LLMProvider` interface; Ollama (NDJSON), OpenAI-compatible (SSE), Custom (content-type sniff); `factory.ts`; `http.ts` shared timeout/abort + error mapping |
| Streaming | `src/streaming/parsers.ts` | `readLines`, `parseNdjson`, `parseSse`, `readText` — pure async generators over `ReadableStream` |
| Markdown | `src/markdown/markdown-renderer.ts` | Block + inline parser producing DOM nodes; URL scheme allowlist |
| Persistence | `src/persistence/storage.ts` | `ConversationStorage` (localStorage / memory), schema-validated, messages only |
| Styles | `src/styles/widget.css` | Imported `?inline`; applied via constructable stylesheet (shared) or `<style>` fallback |
| Types | `src/types/chat.ts` | `ChatMessage`, `WidgetError` (`code` + user-safe `message` + dev `detail`) |

## Design decisions
- **Single custom element**; sub-components are internal classes. Keeps the host's registry clean and avoids cross-shadow-root event/ARIA issues.
- **Config precedence:** `setConfig()` > attributes > `window.ChatWidgetConfig` > defaults. `attributeChangedCallback` re-resolves.
- **Errors:** providers throw `WidgetError`; the element renders `message` in an error bubble with Retry and emits `error`. `detail` is only logged in dev builds.
- **Abort/timeout:** `createTimedSignal` composes the caller's signal with an idle timer; parsers cancel the reader on abort and surface `AbortError` so the generator does not end silently.
- **Rendering:** messages list reconciles by id; re-renders only changed snapshots; batched per rAF with a 50 ms timer fallback (rAF pauses in hidden tabs).
- **Accessibility:** panel is `role=dialog` labelled by the title; log region is `aria-live=off` with a separate polite live region announcing completed replies/errors; Escape closes; focus returns to the launcher.
- **Security:** no `innerHTML` with dynamic content (static SVG only); links allowlisted; credentials never persisted.

## Server-side knowledge base (Mode B only)
`server/knowledge.mjs` loads `policies.json`, scores each policy against the latest user question (keywords ×3, title words ×2, content words ×0.5, category ×1; threshold 3), and builds a system prompt with the top matches (or a "normal assistant" prompt when none match). `proxy.mjs` prepends it before forwarding to Ollama/OpenAI. The browser widget is unaware of this — policies never reach the client.

## Build
Vite lib mode → `dist/chat-widget.js` (IIFE, global `AIChatWidget`) and `dist/chat-widget.esm.js`. CSS is inlined into JS. `import.meta.env.DEV` gates dev-only warnings.
