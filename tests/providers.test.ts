import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomApiProvider } from '../src/providers/custom-api-provider';
import { createProvider } from '../src/providers/factory';
import { OllamaProvider, parseOllamaChunk } from '../src/providers/ollama-provider';
import {
  OpenAICompatibleProvider,
  parseOpenAIChunk,
} from '../src/providers/openai-compatible-provider';
import type { LLMProvider } from '../src/providers/types';
import { WidgetError } from '../src/types/chat';
import { collect, mockFetchResponse, ndjson, sse, streamFrom } from './helpers';

const messages = [{ role: 'user' as const, content: 'hi' }];

afterEach(() => vi.unstubAllGlobals());

async function expectWidgetError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error('expected rejection');
  } catch (err) {
    expect(err).toBeInstanceOf(WidgetError);
    expect((err as WidgetError).code).toBe(code);
  }
}

describe('provider abstraction', () => {
  it('factory returns providers implementing LLMProvider', () => {
    const p: LLMProvider = createProvider({ kind: 'ollama', baseUrl: 'http://x', model: 'm' });
    expect(p).toBeInstanceOf(OllamaProvider);
    expect(typeof p.streamChat).toBe('function');
    expect(createProvider({ kind: 'openai', baseUrl: 'http://x', model: 'm' })).toBeInstanceOf(
      OpenAICompatibleProvider,
    );
    expect(createProvider({ kind: 'custom', endpoint: 'http://x' })).toBeInstanceOf(
      CustomApiProvider,
    );
  });
});

describe('OllamaProvider', () => {
  it('builds a streaming /api/chat request', () => {
    const p = new OllamaProvider({ baseUrl: 'http://localhost:11434/', model: 'gemma3:4b' });
    const { url, init } = p.buildRequest(messages, { temperature: 0.2 });
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gemma3:4b',
      stream: true,
      messages,
      options: { temperature: 0.2 },
    });
  });

  it('streams NDJSON deltas until done', async () => {
    mockFetchResponse(
      streamFrom([
        ndjson([{ message: { role: 'assistant', content: 'Hel' }, done: false }]),
        ndjson([
          { message: { role: 'assistant', content: 'lo' }, done: false },
          { message: { content: '' }, done: true },
        ]),
      ]),
    );
    const p = new OllamaProvider({ baseUrl: 'http://x', model: 'm' });
    expect(await collect(p.streamChat(messages))).toBe('Hello');
  });

  it('parses chunk shapes and errors', () => {
    expect(parseOllamaChunk({ message: { content: 'a' }, done: false })).toEqual({
      text: 'a',
      done: false,
    });
    expect(parseOllamaChunk({ error: 'boom' }).error).toBe('boom');
    expect(() => parseOllamaChunk('nope')).toThrow(WidgetError);
  });

  it('maps 404 model errors', async () => {
    mockFetchResponse('{"error":"model \'nope\' not found"}', { status: 404 });
    const p = new OllamaProvider({ baseUrl: 'http://x', model: 'nope' });
    await expectWidgetError(collect(p.streamChat(messages)), 'model-unavailable');
  });

  it('maps network failures to connection-failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const p = new OllamaProvider({ baseUrl: 'http://x', model: 'm' });
    await expectWidgetError(collect(p.streamChat(messages)), 'connection-failed');
  });

  it('maps malformed stream data', async () => {
    mockFetchResponse(streamFrom(['not json\n']));
    const p = new OllamaProvider({ baseUrl: 'http://x', model: 'm' });
    await expectWidgetError(collect(p.streamChat(messages)), 'malformed-response');
  });

  it('maps server-side stream errors', async () => {
    mockFetchResponse(streamFrom([ndjson([{ error: 'out of memory' }])]));
    const p = new OllamaProvider({ baseUrl: 'http://x', model: 'm' });
    await expectWidgetError(collect(p.streamChat(messages)), 'server-error');
  });

  it('honours AbortSignal', async () => {
    mockFetchResponse(
      streamFrom(
        [
          ndjson([{ message: { content: 'a' }, done: false }]),
          ndjson([{ message: { content: 'b' }, done: false }]),
        ],
        30,
      ),
    );
    const p = new OllamaProvider({ baseUrl: 'http://x', model: 'm' });
    const ac = new AbortController();
    const iter = p.streamChat(messages, { signal: ac.signal })[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.value).toBe('a');
    ac.abort();
    await expectWidgetError(iter.next(), 'aborted');
  });

  it('times out when the stream goes idle', async () => {
    mockFetchResponse(
      streamFrom([ndjson([{ message: { content: 'a' }, done: false }]), 'never'], 200),
    );
    const p = new OllamaProvider({ baseUrl: 'http://x', model: 'm' });
    await expectWidgetError(collect(p.streamChat(messages, { timeoutMs: 50 })), 'timeout');
  });
});

describe('OpenAICompatibleProvider', () => {
  it('sends bearer auth and stream:true to /chat/completions', () => {
    const p = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt',
      apiKey: 'k',
    });
    const { url, init } = p.buildRequest(messages);
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'gpt', stream: true });
  });

  it('streams SSE deltas until [DONE]', async () => {
    const chunk = (c: string) => ({ choices: [{ delta: { content: c } }] });
    mockFetchResponse(streamFrom([sse([chunk('He'), chunk('llo'), '[DONE]'])]), {
      contentType: 'text/event-stream',
    });
    const p = new OpenAICompatibleProvider({ baseUrl: 'http://x', model: 'm' });
    expect(await collect(p.streamChat(messages))).toBe('Hello');
  });

  it('maps 401 to unauthorized', async () => {
    mockFetchResponse('{"error":{"message":"bad key"}}', { status: 401 });
    const p = new OpenAICompatibleProvider({ baseUrl: 'http://x', model: 'm' });
    await expectWidgetError(collect(p.streamChat(messages)), 'unauthorized');
  });

  it('parses chunk shapes', () => {
    expect(parseOpenAIChunk({ choices: [{ delta: { content: 'x' } }] })).toEqual({ text: 'x' });
    expect(parseOpenAIChunk({ choices: [] })).toEqual({ text: '' });
    expect(parseOpenAIChunk({ error: { message: 'bad' } }).error).toBe('bad');
  });
});

describe('CustomApiProvider', () => {
  it('handles SSE with {delta} objects', async () => {
    mockFetchResponse(streamFrom([sse([{ delta: 'a' }, { delta: 'b' }, '[DONE]'])]), {
      contentType: 'text/event-stream',
    });
    const p = new CustomApiProvider({ endpoint: 'http://x/api/chat' });
    expect(await collect(p.streamChat(messages))).toBe('ab');
  });
  it('handles NDJSON', async () => {
    mockFetchResponse(streamFrom([ndjson([{ content: 'a' }, { content: 'b' }])]), {
      contentType: 'application/x-ndjson',
    });
    const p = new CustomApiProvider({ endpoint: 'http://x' });
    expect(await collect(p.streamChat(messages))).toBe('ab');
  });
  it('handles plain text streams', async () => {
    mockFetchResponse(streamFrom(['hel', 'lo']), { contentType: 'text/plain' });
    const p = new CustomApiProvider({ endpoint: 'http://x' });
    expect(await collect(p.streamChat(messages))).toBe('hello');
  });
  it('handles a single JSON response and error objects', async () => {
    mockFetchResponse('{"content":"done"}', { contentType: 'application/json' });
    const p = new CustomApiProvider({ endpoint: 'http://x' });
    expect(await collect(p.streamChat(messages))).toBe('done');
    mockFetchResponse(streamFrom([sse([{ error: 'nope' }])]), { contentType: 'text/event-stream' });
    await expectWidgetError(collect(p.streamChat(messages)), 'server-error');
  });
  it('maps 5xx responses', async () => {
    mockFetchResponse('oops', { status: 503 });
    const p = new CustomApiProvider({ endpoint: 'http://x' });
    await expectWidgetError(collect(p.streamChat(messages)), 'server-error');
  });
});
