import { WidgetError } from '../types/chat';
import { parseSse } from '../streaming/parsers';
import { createTimedSignal, fetchOrThrow, isRecord, joinUrl, mapStreamError } from './http';
import type {
  ChatOptions,
  LLMProvider,
  OpenAICompatibleProviderConfig,
  ProviderMessage,
} from './types';

/**
 * Generic OpenAI-compatible provider: POST {baseUrl}/chat/completions with
 * stream:true and SSE parsing. Works with OpenAI, LM Studio, vLLM, llama.cpp,
 * Ollama's /v1 endpoint, and most proxies.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly headers: Record<string, string>;

  constructor(config: Omit<OpenAICompatibleProviderConfig, 'kind'>) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.headers = config.headers ?? {};
  }

  buildRequest(
    messages: ProviderMessage[],
    options?: ChatOptions,
  ): { url: string; init: RequestInit } {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers,
      ...(options?.headers ?? {}),
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    return {
      url: joinUrl(this.baseUrl, '/chat/completions'),
      init: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  }

  async *streamChat(messages: ProviderMessage[], options?: ChatOptions): AsyncIterable<string> {
    const timed = createTimedSignal(options);
    const label = 'the AI service';
    try {
      const { url, init } = this.buildRequest(messages, options);
      const response = await fetchOrThrow(url, init, timed, label);
      try {
        for await (const event of parseSse(
          response.body as ReadableStream<Uint8Array>,
          timed.signal,
        )) {
          timed.touch();
          if (event.data.trim() === '[DONE]') return;
          const delta = parseOpenAIChunk(JSON.parse(event.data));
          if (delta.error)
            throw new WidgetError('server-error', 'The AI service reported an error.', delta.error);
          if (delta.text) yield delta.text;
        }
      } catch (err) {
        throw mapStreamError(err, timed, label);
      }
    } finally {
      timed.dispose();
    }
  }
}

export interface OpenAIDelta {
  text: string;
  error?: string;
}

/** Extracts the text delta from one OpenAI-style chat.completion.chunk object. */
export function parseOpenAIChunk(chunk: unknown): OpenAIDelta {
  if (!isRecord(chunk))
    throw new WidgetError('malformed-response', 'The AI service sent an unexpected response.');
  if (isRecord(chunk.error)) {
    const msg = chunk.error.message;
    return { text: '', error: typeof msg === 'string' ? msg : JSON.stringify(chunk.error) };
  }
  const choices = chunk.choices;
  if (!Array.isArray(choices) || choices.length === 0) return { text: '' };
  const first: unknown = choices[0];
  if (!isRecord(first)) return { text: '' };
  const delta = first.delta;
  if (isRecord(delta) && typeof delta.content === 'string') return { text: delta.content };
  // Non-streaming fallback shape
  const message = first.message;
  if (isRecord(message) && typeof message.content === 'string') return { text: message.content };
  return { text: '' };
}
