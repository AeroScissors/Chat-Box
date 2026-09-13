import { WidgetError } from '../types/chat';
import { parseNdjson, parseSse, readText } from '../streaming/parsers';
import { createTimedSignal, fetchOrThrow, isRecord, mapStreamError } from './http';
import type { ChatOptions, CustomApiProviderConfig, LLMProvider, ProviderMessage } from './types';

/**
 * Custom backend provider. Protocol (documented in README):
 *
 *   POST {endpoint}
 *   Content-Type: application/json
 *   { "messages": [{role, content}], "model"?: string, "stream": true }
 *
 * Accepted responses (detected by Content-Type):
 *   - text/event-stream: SSE; each `data:` is either raw text, `{"delta": "..."}`,
 *     `{"content": "..."}`, an OpenAI chunk, or `[DONE]`.
 *   - application/x-ndjson / application/jsonl: one JSON per line with `delta`/`content`.
 *   - text/plain: raw streamed text.
 *   - application/json: single object `{ "content": "..." }` or `{ "error": "..." }`.
 */
export class CustomApiProvider implements LLMProvider {
  readonly name = 'custom';
  private readonly endpoint: string;
  private readonly model: string | undefined;
  private readonly headers: Record<string, string>;

  constructor(config: Omit<CustomApiProviderConfig, 'kind'>) {
    this.endpoint = config.endpoint;
    this.model = config.model;
    this.headers = config.headers ?? {};
  }

  buildRequest(
    messages: ProviderMessage[],
    options?: ChatOptions,
  ): { url: string; init: RequestInit } {
    const body: Record<string, unknown> = {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (this.model) body.model = this.model;
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    return {
      url: this.endpoint,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
          ...(options?.headers ?? {}),
        },
        body: JSON.stringify(body),
      },
    };
  }

  async *streamChat(messages: ProviderMessage[], options?: ChatOptions): AsyncIterable<string> {
    const timed = createTimedSignal(options);
    const label = 'the chat server';
    try {
      const { url, init } = this.buildRequest(messages, options);
      const response = await fetchOrThrow(url, init, timed, label);
      const body = response.body as ReadableStream<Uint8Array>;
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      try {
        if (contentType.includes('text/event-stream')) {
          for await (const event of parseSse(body, timed.signal)) {
            timed.touch();
            if (event.data.trim() === '[DONE]') return;
            const text = extractDelta(event.data);
            if (text) yield text;
          }
        } else if (contentType.includes('ndjson') || contentType.includes('jsonl')) {
          for await (const obj of parseNdjson(body, timed.signal)) {
            timed.touch();
            const text = extractDeltaFromValue(obj);
            if (text) yield text;
          }
        } else if (contentType.includes('application/json')) {
          const text = await response.text();
          timed.touch();
          const parsed: unknown = JSON.parse(text);
          const content = extractDeltaFromValue(parsed);
          if (content) yield content;
        } else {
          for await (const text of readText(body, timed.signal)) {
            timed.touch();
            yield text;
          }
        }
      } catch (err) {
        throw mapStreamError(err, timed, label);
      }
    } finally {
      timed.dispose();
    }
  }
}

/** Accepts raw text or a JSON string; returns the text delta. */
export function extractDelta(data: string): string {
  const trimmed = data.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return data; // not JSON after all; treat as plain text
    }
    return extractDeltaFromValue(parsed);
  }
  return data;
}

export function extractDeltaFromValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return '';
  if (typeof value.error === 'string') {
    throw new WidgetError('server-error', 'The chat server reported an error.', value.error);
  }
  if (typeof value.delta === 'string') return value.delta;
  if (typeof value.content === 'string') return value.content;
  if (typeof value.text === 'string') return value.text;
  // OpenAI-style chunk
  const choices = value.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first: unknown = choices[0];
    if (isRecord(first)) {
      const delta = first.delta;
      if (isRecord(delta) && typeof delta.content === 'string') return delta.content;
      const message = first.message;
      if (isRecord(message) && typeof message.content === 'string') return message.content;
    }
  }
  // Ollama-style chunk
  const message = value.message;
  if (isRecord(message) && typeof message.content === 'string') return message.content;
  return '';
}
