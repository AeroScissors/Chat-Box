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
`GET /health` (`{ok, upstream, policies}`), `GET /api/policies` (`{company, policies:[{id,category,title}]}`), `POST /api/chat` (protocol above; a knowledge-base system message is prepended server-side). Client `system` messages are dropped; last message must be `user`; prior assistant turns are demoted to unverified context. Responses: `400` invalid, `401` (when `AUTH_TOKEN` set), `429` rate/concurrency limit, `502` upstream. Env: `PORT, UPSTREAM(ollama|openai), OLLAMA_URL, OPENAI_BASE_URL, OPENAI_API_KEY, MODEL, ALLOWED_MODELS, ALLOWED_ORIGINS, KNOWLEDGE_FILE, AUTH_TOKEN, EXPOSE_POLICIES, SCOPE(open|policies-only), RATE_LIMIT, MAX_CONCURRENT, TRUST_PROXY`.

## Knowledge base (`server/knowledge.mjs`, `server/policies.json`)
`createKnowledgeBase(file?)` → `{ company, assistantName, list(), retrieve(query, k=4, minScore=3), buildSystemPrompt(question) → {prompt, matches}, reminder() }`. Policy shape: `{ id, category, title, keywords[], content }`. File is hot-reloaded on change.
