import { WidgetError } from '../types/chat';
import { parseNdjson } from '../streaming/parsers';
import { createTimedSignal, fetchOrThrow, isRecord, joinUrl, mapStreamError } from './http';
import type { ChatOptions, LLMProvider, OllamaProviderConfig, ProviderMessage } from './types';

/**
 * Ollama provider — split into three responsibilities:
 *  - connection: base URL + headers (constructor / buildRequest)
 *  - request: POST /api/chat with stream:true
 *  - streaming parser: NDJSON → text deltas (parseOllamaChunk)
 */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly headers: Record<string, string>;

  constructor(config: Omit<OllamaProviderConfig, 'kind'>) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.headers = config.headers ?? {};
  }

  buildRequest(
    messages: ProviderMessage[],
    options?: ChatOptions,
  ): { url: string; init: RequestInit } {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (options?.temperature !== undefined) body.options = { temperature: options.temperature };
    return {
      url: joinUrl(this.baseUrl, '/api/chat'),
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
    const label = 'Ollama';
    try {
      const { url, init } = this.buildRequest(messages, options);
      const response = await fetchOrThrow(url, init, timed, label);
      try {
        for await (const chunk of parseNdjson(
          response.body as ReadableStream<Uint8Array>,
          timed.signal,
        )) {
          timed.touch();
          const delta = parseOllamaChunk(chunk);
          if (delta.error)
            throw new WidgetError('server-error', 'Ollama reported an error.', delta.error);
          if (delta.text) yield delta.text;
          if (delta.done) return;
        }
      } catch (err) {
        throw mapStreamError(err, timed, label);
      }
    } finally {
      timed.dispose();
    }
  }
}

export interface OllamaDelta {
  text: string;
  done: boolean;
  error?: string;
}

/** Extracts the text delta from one Ollama /api/chat NDJSON object. */
export function parseOllamaChunk(chunk: unknown): OllamaDelta {
  if (!isRecord(chunk)) {
    throw new WidgetError('malformed-response', 'Received an unexpected response from Ollama.');
  }
  if (typeof chunk.error === 'string') return { text: '', done: true, error: chunk.error };
  const message = chunk.message;
  const text = isRecord(message) && typeof message.content === 'string' ? message.content : '';
  return { text, done: chunk.done === true };
}
