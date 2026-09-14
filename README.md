# AI Chat Widget

A floating AI chat bubble you can drop into **any** website with two lines. One JS file, no framework needed. Works with Ollama (local), OpenAI-style APIs, or your own backend.

## Run it

```bash
git clone https://github.com/AeroScissors/Chat-Box.git
cd Chat-Box
npm install
npm run build        # → dist/chat-widget.js
npm run dev          # demo at http://localhost:5173/demo/index.html
```

Local AI (optional):

```bash
ollama pull gemma3:4b
MODEL=gemma3:4b npm run proxy     # backend at http://localhost:8787
```

## Add it to your site

```html
<script src="/chat-widget.js"></script>
<ai-chat-widget
  provider="custom"
  api-endpoint="http://localhost:8787/api/chat"
  title="AI Assistant"
></ai-chat-widget>
```

Talk to Ollama directly instead (local use only):

```html
<ai-chat-widget provider="ollama" model="gemma3:4b"></ai-chat-widget>
```

Give the assistant your company knowledge — it answers from it and chats normally otherwise:

- **PDF / text**: drop handbook PDFs (or `.txt`/`.md`) into `server/policies/`. They are split by headings and hot-reloaded.
- **Recommended — convert once to JSON**: `npm run pdf2json -- server/policies/handbook.pdf` writes `handbook.json` next to it (same folder, PDF is then ignored). Open the JSON to fix titles and add your own `keywords` (e.g. `"dr"`, `"sla"`) so questions phrased differently still hit the right section.
- **JSON**: `server/policies.json` (`KNOWLEDGE_FILE=none` to turn it off).
- **MySQL (phpMyAdmin)**: `DB_URL=mysql://reader:pw@localhost:3306/mydb DB_TABLES=products,faq npm run proxy` — rows of the listed tables become searchable records; `DB_POLICIES_TABLE=policies` reads a `title/content` table. Read-only; use a SELECT-only user.

## Let an AI integrate it for you

Paste this into Claude Code / Cursor / ChatGPT inside **your** project:

```text
Add the AI Chat Widget from https://github.com/AeroScissors/Chat-Box to this project.

My stack: <e.g. Next.js / plain HTML / Laravel / WordPress>
AI source: <"my backend" (recommended) | "Ollama on localhost" | "OpenAI-style URL">
Branding: title "<name>", colour <#hex>

How it works:
- Build once with `npm install && npm run build` in the widget repo → copy dist/chat-widget.js into my static folder. No npm package, no framework dependency.
- Embed before </body>:  <script src="/chat-widget.js"></script> <ai-chat-widget></ai-chat-widget>
- Configure with attributes: provider (custom|ollama|openai), api-endpoint, model, ollama-url, title, subtitle, logo, primary-color, theme (light|dark|system), position, width, height, welcome-message, placeholder, persist-conversation. Or window.ChatWidgetConfig = {...} before the script. JS API: open(), close(), sendMessage(text), clearConversation(), setConfig({}). Events: chat-open, chat-close, message-sent, response-complete, error.
- provider="custom": widget POSTs {messages:[{role,content}], stream:true} to api-endpoint and reads text/event-stream lines `data: {"delta":"..."}` ending with `data: [DONE]`. The repo's server/proxy.mjs implements this (env MODEL, OLLAMA_URL or UPSTREAM=openai + OPENAI_API_KEY, ALLOWED_ORIGINS). If my project has a backend, implement that endpoint there instead.
- Never put an API key in the page; keep secrets in the backend; restrict CORS to my origin.
- React/TS: declare 'ai-chat-widget' in JSX.IntrinsicElements. Vue: isCustomElement. Angular: CUSTOM_ELEMENTS_SCHEMA. Next.js: next/script afterInteractive in root layout.

Do: add the file + two lines to the base layout, wire my AI source, apply branding, run the project, send a test message, fix any errors, and list the files you changed. Keep changes minimal.
```

## More

- [docs/INTEGRATION.md](docs/INTEGRATION.md) — step-by-step guide with framework recipes
- [docs/REFERENCE.md](docs/REFERENCE.md) — every option, API, events, security, proxy

MIT
