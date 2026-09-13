/**
 * Minimal backend proxy (Mode B). Zero dependencies — Node 18+.
 *
 *   Third-party website → <ai-chat-widget provider="custom" api-endpoint="https://your-host/api/chat">
 *                        → this server (holds secrets, enforces CORS/rate limits)
 *                        → Ollama (or any OpenAI-compatible upstream)
 *
 * Environment:
 *   PORT              default 8787
 *   UPSTREAM          "ollama" (default) or "openai"
 *   OLLAMA_URL        default http://localhost:11434
 *   OPENAI_BASE_URL   e.g. https://api.openai.com/v1
 *   OPENAI_API_KEY    server-side secret; never sent to the browser
 *   MODEL             default model when the client omits one (recommended: always set)
 *   ALLOWED_MODELS    comma-separated allowlist; empty = only MODEL
 *   ALLOWED_ORIGINS   comma-separated CORS allowlist; "*" for development
 *   KNOWLEDGE_FILE    path to the policies JSON (default: server/policies.json); set to "none" to disable
 *   AUTH_TOKEN        if set, every request must carry `Authorization: Bearer <token>` (see README:
 *                     a token in a public page is not a secret — use it for internal sites, or replace
 *                     authorize() with your session/SSO check)
 *   EXPOSE_POLICIES   "true" to enable GET /api/policies (default off)
 *   SCOPE             "policies-only" answers unmatched questions with a canned reply and never calls
 *                     the model for them (default: "open" — normal chat for unmatched questions)
 *   RATE_LIMIT        requests per minute per client IP (default 20)
 *   MAX_CONCURRENT    simultaneous upstream generations (default 4)
 *   TRUST_PROXY       "true" to read the client IP from X-Forwarded-For (only behind your own LB)
 *
 * Knowledge base: for each request the latest user question is matched against
 * policies.json and the relevant policies are injected as a system prompt, so
 * the model answers company/security/database questions from policy and
 * everything else as a normal assistant. See knowledge.mjs.
 */
import http from 'node:http';
import { createKnowledgeBase } from './knowledge.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const UPSTREAM = process.env.UPSTREAM ?? 'ollama';
const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(
  /\/+$/,
  '',
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const MODEL = process.env.MODEL ?? '';
const ALLOWED_MODELS = new Set(
  (process.env.ALLOWED_MODELS ?? MODEL)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
const MAX_MESSAGES = 50;
const MAX_CHARS = 32_000;
const KNOWLEDGE_FILE = process.env.KNOWLEDGE_FILE ?? '';
const knowledge =
  KNOWLEDGE_FILE === 'none' ? null : createKnowledgeBase(KNOWLEDGE_FILE || undefined);
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? '';
const EXPOSE_POLICIES = process.env.EXPOSE_POLICIES === 'true';
const SCOPE = process.env.SCOPE === 'policies-only' ? 'policies-only' : 'open';
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 20);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 4);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const OUT_OF_SCOPE_REPLY =
  'I can only help with questions about company security, policies and databases. For anything else, please contact HR (people@example.com) or Security (security@example.com).';

/* ------------------------------ abuse controls ----------------------------- */

const buckets = new Map(); // ip -> timestamps (ms) of recent requests
let inFlight = 0;

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (buckets.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT) {
    buckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  buckets.set(ip, recent);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of buckets) {
    const recent = ts.filter((t) => now - t < 60_000);
    if (recent.length === 0) buckets.delete(ip);
    else buckets.set(ip, recent);
  }
}, 60_000).unref();

/**
 * Request authorisation. With AUTH_TOKEN unset every request is allowed (dev).
 * For internal deployments replace this with your session/SSO check
 * (e.g. validate a cookie or a JWT issued to logged-in employees).
 */
function authorize(req) {
  if (!AUTH_TOKEN) return true;
  const header = req.headers.authorization ?? '';
  return header === `Bearer ${AUTH_TOKEN}`;
}

function cors(req, res) {
  const origin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : null;
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return allow !== null;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Validates and sanitises client messages. Client-supplied `system` messages are
 * DROPPED: the system prompt is owned by this server, otherwise anyone could
 * POST their own instructions (see README → Threat model).
 */
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return null;
  let total = 0;
  const clean = [];
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || !['system', 'user', 'assistant'].includes(m.role))
      return null;
    if (m.role === 'system') continue;
    total += m.content.length;
    clean.push({ role: m.role, content: m.content });
  }
  if (clean.length === 0 || clean[clean.length - 1].role !== 'user') return null;
  return total > MAX_CHARS ? null : clean;
}

/**
 * Wraps the conversation with the knowledge-base system prompt and a trailing
 * reminder. Returns `{ messages }` or `{ canned }` when SCOPE=policies-only and
 * nothing matched (no model call is made for those).
 */
function withKnowledge(messages) {
  if (!knowledge) return { messages };
  // Retrieve on the last two user turns so short follow-ups ("so confirm?") keep their topic.
  const userTurns = messages.filter((m) => m.role === 'user').slice(-2);
  const query = userTurns.map((m) => m.content).join('\n');
  const { prompt, matches } = knowledge.buildSystemPrompt(query);
  if (matches.length > 0) console.log(`policies matched: ${matches.join(', ')}`);
  else if (SCOPE === 'policies-only') return { canned: OUT_OF_SCOPE_REPLY };
  // Prior assistant turns come from the client and cannot be verified, so they are
  // demoted to quoted context inside a user turn instead of real assistant turns.
  // The model then treats them as claims rather than its own prior statements.
  const history = messages.slice(0, -1);
  const lastUser = messages[messages.length - 1];
  const wrapped = [];
  for (const m of history) {
    if (m.role === 'user') wrapped.push(m);
    else
      wrapped.push({
        role: 'user',
        content: `[Earlier reply shown to the user — unverified, may be wrong]: ${m.content}`,
      });
  }
  return {
    messages: [
      { role: 'system', content: prompt },
      ...wrapped,
      lastUser,
      { role: 'system', content: knowledge.reminder() },
    ],
  };
}

function sendCanned(res, text) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

async function handleChat(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' });
  }
  const clientMessages = validateMessages(payload.messages);
  if (!clientMessages) return json(res, 400, { error: 'Invalid messages' });
  const model = typeof payload.model === 'string' && payload.model ? payload.model : MODEL;
  if (!model || !ALLOWED_MODELS.has(model)) return json(res, 400, { error: 'Model not allowed' });
  const prepared = withKnowledge(clientMessages);
  if (prepared.canned) return sendCanned(res, prepared.canned);
  if (inFlight >= MAX_CONCURRENT) {
    res.setHeader('Retry-After', '5');
    return json(res, 429, { error: 'Server busy, try again shortly' });
  }
  inFlight++;
  try {
    await streamUpstream(req, res, prepared.messages, model);
  } finally {
    inFlight--;
  }
}

async function streamUpstream(req, res, messages, model) {
  const ac = new AbortController();
  req.on('close', () => ac.abort());

  let upstream;
  try {
    upstream =
      UPSTREAM === 'openai'
        ? await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({ model, messages, stream: true }),
            signal: ac.signal,
          })
        : await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages, stream: true }),
            signal: ac.signal,
          });
  } catch (err) {
    console.error('upstream connection failed:', err.message);
    return json(res, 502, { error: 'Upstream unavailable' });
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    console.error('upstream error', upstream.status, text.slice(0, 200));
    return json(res, upstream.status === 404 ? 404 : 502, {
      error: /model/i.test(text) ? 'model not found' : 'Upstream error',
    });
  }

  // Normalise both upstreams to SSE: data: {"delta": "..."}  ...  data: [DONE]
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (delta) => res.write(`data: ${JSON.stringify({ delta })}\n\n`);
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        if (UPSTREAM === 'openai') {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') break;
          const obj = JSON.parse(data);
          const delta = obj.choices?.[0]?.delta?.content;
          if (delta) send(delta);
        } else {
          const obj = JSON.parse(line);
          if (obj.error) throw new Error(obj.error);
          if (obj.message?.content) send(obj.message.content);
          if (obj.done) break;
        }
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    if (!ac.signal.aborted) {
      console.error('stream error:', err.message);
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
    }
  } finally {
    res.end();
  }
}

http
  .createServer(async (req, res) => {
    const allowed = cors(req, res);
    if (req.method === 'OPTIONS') return res.writeHead(allowed ? 204 : 403).end();
    if (!allowed) return json(res, 403, { error: 'Origin not allowed' });
    if (req.method === 'GET' && req.url === '/health')
      return json(res, 200, {
        ok: true,
        upstream: UPSTREAM,
        policies: knowledge ? knowledge.list().length : 0,
        scope: SCOPE,
        auth: Boolean(AUTH_TOKEN),
      });
    if (!authorize(req)) return json(res, 401, { error: 'Unauthorized' });
    if (rateLimited(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return json(res, 429, { error: 'Too many requests' });
    }
    if (req.method === 'GET' && req.url === '/api/policies') {
      if (!EXPOSE_POLICIES) return json(res, 404, { error: 'Not found' });
      return json(res, 200, {
        company: knowledge?.company ?? null,
        policies: knowledge ? knowledge.list() : [],
      });
    }
    if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
    json(res, 404, { error: 'Not found' });
  })
  .listen(PORT, () => {
    console.log(
      `chat proxy listening on http://localhost:${PORT} (upstream: ${UPSTREAM}, model: ${MODEL || 'client-selected'}, policies: ${knowledge ? knowledge.list().length : 'disabled'})`,
    );
  });
