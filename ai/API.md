# API

## Element `<ai-chat-widget>` (`AIChatWidgetElement`)

Methods: `open()`, `close()`, `toggle()`, `isOpen` (getter), `sendMessage(text): Promise<void>`, `stopGeneration()`, `clearConversation()`, `getMessages(): ChatMessage[]`, `setConfig(partial)`, `getConfig()`.

Events (`CustomEvent`, bubbles + composed): `chat-open`, `chat-close`, `message-sent {message}`, `response-start {messageId}`, `response-complete {message}`, `conversation-cleared`, `error {code, message}`.

Attributes: `provider, model, api-endpoint, api-key, ollama-url, title, subtitle, logo, position, theme, primary-color, width, height, welcome-message, placeholder, system-prompt, persist-conversation, storage-key, timeout-ms, temperature, open-on-load`. JS-only keys: `headers`, `customProvider`.

Global: `window.ChatWidgetConfig` (PartialWidgetConfig), `window.AIChatWidget` (IIFE exports).

## Provider interface
```ts
interface LLMProvider { name: string; streamChat(messages: ProviderMessage[], options?: ChatOptions): AsyncIterable<string>; }
interface ChatOptions { signal?: AbortSignal; timeoutMs?: number; temperature?: number; headers?: Record<string,string>; }
```

## Custom backend protocol (`provider="custom"`)
`POST {apiEndpoint}` JSON `{messages, stream: true, model?}` → `text/event-stream` (`data: {"delta":"…"}` … `data: [DONE]`), or NDJSON `{delta|content}`, or `text/plain`, or JSON `{content}` / `{error}`.

## Proxy (`server/proxy.mjs`)
`GET /health` (`{ok, upstream, policies, sources:{file,documents,db}}`), `GET /api/policies` (`{company, policies:[{id,category,title,source}]}`), `POST /api/chat` (protocol above; a knowledge-base system message is prepended server-side). Client `system` messages are dropped; last message must be `user`; prior assistant turns are demoted to unverified context. Responses: `400` invalid, `401` (when `AUTH_TOKEN` set), `429` rate/concurrency limit, `502` upstream. Env: `PORT, UPSTREAM(ollama|openai), OLLAMA_URL, OPENAI_BASE_URL, OPENAI_API_KEY, MODEL, ALLOWED_MODELS, ALLOWED_ORIGINS, KNOWLEDGE_FILE, POLICIES_DIR, DB_URL, DB_POLICIES_TABLE, DB_TABLES, DB_MAX_ROWS, DB_REFRESH_SECONDS, COMPANY_NAME, ASSISTANT_NAME, AUTH_TOKEN, EXPOSE_POLICIES, SCOPE(open|policies-only), RATE_LIMIT, MAX_CONCURRENT, TRUST_PROXY`.

## Knowledge base (`server/knowledge.mjs`, `server/policies.json`, `server/documents.mjs`, `server/db.mjs`)
`createKnowledgeBase(file?, {company, assistantName}?)` (`file === null` = no JSON) → `{ company, assistantName, setSource(name, policies[]), stats(), list(), retrieve(query, k=4, minScore=3), buildSystemPrompt(question) → {prompt, matches}, reminder() }`. Policy shape: `{ id, category, title, keywords[]?, content, source }`; missing keywords are derived (`deriveKeywords`). JSON file hot-reloaded.
- `documents.mjs`: `loadDocument(path, category?)` / `loadDocuments(dir)` / `watchDocuments(dir, onLoad)` — `.pdf` (pdf-parse) / `.txt` / `.md` → `splitSections(text, title)` by headings (`isHeading`) → policies `{id: <file-slug>-<n>, category: <file-slug>, source:'documents'}`; `.json` (`{policies:[…]}`) loaded verbatim, and a same-named `.pdf/.txt/.md` is skipped.
- `pdf-to-json.mjs` (`npm run pdf2json -- <file> [out.json] [--category c]`): converts a document to policies JSON with derived keywords (`commonWords` filtered) for manual editing.
- `db.mjs`: `createDbSource({url, policiesTable, tables, maxRows, refreshSeconds}, onLoad)` → `{refresh, close}`; `policyFromRow(row, table, i)`, `recordFromRow(row, table, i)` (ids `db:<table>:<id>`). Read-only `SELECT * LIMIT n`, identifier-validated.
