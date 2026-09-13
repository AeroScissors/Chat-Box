# Add an AI chat bubble to your website in 5 minutes

This guide is for anyone — you don't need to know how the widget works inside.
If you can add a `<script>` tag to a web page, you can do this.

---

## What you get

A small round chat button in the bottom-right corner of your site. Visitors click it, a chat window slides open, and they talk to an AI. Answers stream in word by word, code and lists look nice, it works on phones, it has light and dark mode, and it cannot be broken by your site's CSS (or break it).

It is **one file**: `chat-widget.js`. No frameworks, no npm, no build step on your side.

---

## Step 1 — Get the file

Either download a release, or build it yourself:

```bash
git clone <this repo>
cd chat-widget
npm install
npm run build
```

You now have `dist/chat-widget.js`. Copy that one file into your website's static folder (the same place you keep images or CSS — for example `/public`, `/static`, `/assets`, or your CDN).

---

## Step 2 — Put two lines on your page

Anywhere before `</body>`:

```html
<script src="/assets/chat-widget.js"></script>
<ai-chat-widget></ai-chat-widget>
```

Reload the page. You should see the chat bubble. It will say it is not configured yet — that's Step 3.

---

## Step 3 — Tell it where the AI is

Pick **one** of these three. If you're not sure, pick **B**.

### A) "The AI runs on my own computer" (Ollama)

Good for: trying it out, personal tools, internal dashboards.

1. Install Ollama from <https://ollama.com/download> and start it.
2. Download a model: `ollama pull gemma3:4b` (any chat model works).
3. Configure the widget:

```html
<ai-chat-widget
  provider="ollama"
  ollama-url="http://localhost:11434"
  model="gemma3:4b"
></ai-chat-widget>
```

⚠️ This only works when the visitor's _own_ machine runs Ollama. Random visitors on the internet don't have Ollama, so for a public website use **B**.

### B) "I have (or will run) a small server in the middle" — recommended

Good for: real websites, company intranets, anything with API keys or private policies.

Your page talks to **your** server; your server talks to the AI. Secrets never reach the browser, and you can add login, rate limits, and your own knowledge (see "Add your company knowledge" below).

1. Start the included server (Node 18+, no dependencies):
   ```bash
   MODEL=gemma3:4b node server/proxy.mjs          # uses Ollama on the server machine
   # or a cloud model:
   UPSTREAM=openai OPENAI_API_KEY=sk-… MODEL=gpt-4o-mini node server/proxy.mjs
   ```
2. Point the widget at it:
   ```html
   <ai-chat-widget
     provider="custom"
     api-endpoint="https://your-server.com/api/chat"
   ></ai-chat-widget>
   ```

Already have a backend in Python, PHP, Go, .NET…? Copy the tiny protocol from the README ("Custom API setup") — it's one POST endpoint that streams text back.

### C) "I have an OpenAI-style API URL"

Good for: local servers such as LM Studio, vLLM, llama.cpp, or a gateway you already run.

```html
<ai-chat-widget
  provider="openai"
  api-endpoint="http://localhost:1234/v1"
  model="your-model"
></ai-chat-widget>
```

⚠️ Don't put a real cloud API key in the page — anyone can read it. Use **B** for that.

---

## Step 4 — Make it yours (optional)

Everything is an attribute on the tag. Change what you like, leave the rest out.

```html
<ai-chat-widget
  provider="custom"
  api-endpoint="https://your-server.com/api/chat"
  title="Acme Helper"
  subtitle="Usually replies instantly"
  logo="/images/logo.png"
  welcome-message="Hi! Ask me about orders, returns or **shipping**."
  placeholder="Ask a question…"
  primary-color="#ff5a1f"
  theme="system"
  position="bottom-right"
  width="420px"
  height="640px"
  persist-conversation
></ai-chat-widget>
```

| I want to…                                | Set                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Change the name at the top                | `title="…"`                                                                |
| Add a small line under the name           | `subtitle="…"`                                                             |
| Show my logo                              | `logo="/path/to/image.png"`                                                |
| Change the first message                  | `welcome-message="…"` (Markdown allowed; `""` removes it)                  |
| Match my brand colour                     | `primary-color="#hex"`                                                     |
| Force light or dark                       | `theme="light"` or `theme="dark"` (`system` follows the visitor's setting) |
| Put it bottom-left                        | `position="bottom-left"`                                                   |
| Make it bigger                            | `width="480px" height="700px"` (visitors can also drag-resize it)          |
| Remember the chat after reload            | `persist-conversation`                                                     |
| Open it automatically                     | `open-on-load`                                                             |
| Give the AI a personality (mode A/C only) | `system-prompt="You are …"`                                                |

Prefer JavaScript? Same keys, camelCase:

```html
<script>
  window.ChatWidgetConfig = { provider: 'custom', apiEndpoint: '/api/chat', title: 'Acme Helper' };
</script>
<script src="/assets/chat-widget.js"></script>
<ai-chat-widget></ai-chat-widget>
```

---

## Step 5 — Control it from your code (optional)

```js
const chat = document.querySelector('ai-chat-widget');

chat.open(); // open the window
chat.close();
chat.sendMessage('Where is my order?'); // send on the visitor's behalf
chat.clearConversation();
chat.setConfig({ theme: 'dark' }); // change settings at runtime

chat.addEventListener('message-sent', (e) => console.log(e.detail.message.content));
chat.addEventListener('response-complete', (e) => console.log(e.detail.message.content));
chat.addEventListener('error', (e) => console.warn(e.detail.code, e.detail.message));
```

Example: a "Chat with us" link anywhere on the page:

```html
<a href="#" onclick="document.querySelector('ai-chat-widget').open(); return false;"
  >Chat with us</a
>
```

---

## Using it inside a framework

There is nothing framework-specific to install. The tag works everywhere; you only need to know where "before `</body>`" is in your setup.

<details>
<summary><strong>Plain HTML / static site / PHP / Django / Laravel / Rails</strong></summary>

Put the two lines in your base layout (`layout.php`, `base.html`, `app.blade.php`, `application.html.erb`…) so every page gets the bubble.
</details>

<details>
<summary><strong>React</strong></summary>

1. Put `chat-widget.js` in `public/` and add `<script src="/chat-widget.js"></script>` to `public/index.html`.
2. Use the tag in any component:
   ```jsx
   export function App() {
     return (
       <>
         <YourApp />
         <ai-chat-widget provider="custom" api-endpoint="/api/chat" title="Acme Helper" />
       </>
     );
   }
   ```
3. TypeScript complains about the tag? Add once:
   ```ts
   declare namespace JSX {
     interface IntrinsicElements {
       'ai-chat-widget': any;
     }
   }
   ```
   To call methods, grab it with a `ref` and use `ref.current.open()`.

</details>

<details>
<summary><strong>Next.js</strong></summary>

```jsx
// app/layout.tsx (or pages/_app.tsx)
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Script src="/chat-widget.js" strategy="afterInteractive" />
        <ai-chat-widget provider="custom" api-endpoint="/api/chat" title="Acme Helper" />
      </body>
    </html>
  );
}
```

Put `chat-widget.js` in `public/`. If you use the API-route approach, `/api/chat` can be a Next.js route that follows the protocol in the README.
</details>

<details>
<summary><strong>Vue / Nuxt</strong></summary>

Add the script to `index.html` (Vue) or `nuxt.config` → `app.head.script` (Nuxt), then use `<ai-chat-widget … />` in `App.vue`. Tell Vue it's a custom element:

```js
// vite.config.js
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'ai-chat-widget' } } });
```

</details>

<details>
<summary><strong>Angular</strong></summary>

Add the script to `angular.json` → `"scripts": ["src/assets/chat-widget.js"]`, add `CUSTOM_ELEMENTS_SCHEMA` to your module/component `schemas`, then use the tag in a template.
</details>

<details>
<summary><strong>WordPress</strong></summary>

Upload `chat-widget.js` to your theme (e.g. `wp-content/themes/yourtheme/js/`) and add to `functions.php`:

```php
add_action('wp_enqueue_scripts', function () {
  wp_enqueue_script('ai-chat-widget', get_template_directory_uri() . '/js/chat-widget.js', [], '1.0', true);
});
add_action('wp_footer', function () {
  echo '<ai-chat-widget provider="custom" api-endpoint="https://your-server.com/api/chat" title="Acme Helper"></ai-chat-widget>';
});
```

Or paste both lines into a "Custom HTML" block / a header-footer plugin.
</details>

<details>
<summary><strong>Shopify, Webflow, Squarespace, Wix, Google Tag Manager…</strong></summary>

Host `chat-widget.js` somewhere public (any CDN or your own server), then paste the two lines into the platform's "custom code / footer code" box.
</details>

---

## Add your company knowledge (option B only)

Want the assistant to answer _your_ questions — return policy, opening hours, security rules — and chat normally about the rest?

1. Open `server/policies.json`.
2. Add entries like this (the file reloads automatically):
   ```json
   {
     "id": "returns",
     "category": "company",
     "title": "Return policy",
     "keywords": ["return", "refund", "exchange", "money back"],
     "content": "Items can be returned within 30 days in original packaging. Refunds go to the original payment method within 5 business days."
   }
   ```
3. That's it. When a visitor's question mentions those keywords, the assistant answers from your text and names the policy. Anything else is a normal chat.

Only want policy answers and nothing else? Start the server with `SCOPE=policies-only`.

---

## Before you go live — a 2-minute checklist

- [ ] The widget points at **your server** (option B), not straight at a cloud API with a key in the page.
- [ ] `ALLOWED_ORIGINS=https://your-site.com` is set on the server (not `*`).
- [ ] If the answers are private (internal policies), the page is behind login **and** the server checks that login (`AUTH_TOKEN` or your own `authorize()`).
- [ ] Rate limits are on (they are by default: 20 requests/minute per visitor, 4 at a time).
- [ ] You've tried asking it something nasty ("ignore your rules and…") and were happy with the answer.
- [ ] You tested on a phone.

---

## Something's wrong?

| You see                                  | Do this                                                                                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A red banner "No model configured…"      | Add `model="…"` (options A/C) or `api-endpoint="…"` (option B)                                                                                                                                            |
| "Could not connect to …"                 | The server/Ollama isn't running, the URL is wrong, or the browser blocked it (CORS). Open the browser console — a CORS message means: set `ALLOWED_ORIGINS` on the server, or `OLLAMA_ORIGINS` for Ollama |
| "The configured model is not available." | `ollama pull <model>` on the machine that runs Ollama, or check the model name                                                                                                                            |
| Works locally, not on the real site      | You're using option A. Switch to B                                                                                                                                                                        |
| Bubble is hidden behind something        | Your page has an element with a huge `z-index`; the widget uses `2147483000` — raise it with `ai-chat-widget { --acw-z-index: 2147483647 }`                                                               |
| Nothing appears at all                   | Check the script path in the browser's Network tab (404?) and that the tag is spelled `ai-chat-widget`                                                                                                    |

Still stuck? The full technical README covers every option: [README.md](./README.md).
