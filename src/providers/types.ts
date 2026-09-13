import type { ChatMessage } from '../types/chat';

export interface ChatOptions {
  signal?: AbortSignal;
  /** Request timeout in ms (applies to connection + idle time between chunks). */
  timeoutMs?: number;
  temperature?: number;
  /** Extra headers merged into the request (e.g. auth for a proxy). */
  headers?: Record<string, string>;
}

/** Wire-level message shape sent to providers (no UI fields). */
export interface ProviderMessage {
  role: ChatMessage['role'];
  content: string;
}

/**
 * Provider boundary. The UI only ever talks to this interface.
 * Implementations yield text deltas as they arrive.
 */
export interface LLMProvider {
  readonly name: string;
  streamChat(messages: ProviderMessage[], options?: ChatOptions): AsyncIterable<string>;
}

export type ProviderKind = 'ollama' | 'openai' | 'custom';

export interface OllamaProviderConfig {
  kind: 'ollama';
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
}

export interface OpenAICompatibleProviderConfig {
  kind: 'openai';
  baseUrl: string;
  model: string;
  /** Browser-exposed key — for development only. Use a proxy in production. */
  apiKey?: string;
  headers?: Record<string, string>;
}

export interface CustomApiProviderConfig {
  kind: 'custom';
  /** Full URL of the chat endpoint, e.g. https://api.example.com/api/chat */
  endpoint: string;
  model?: string;
  headers?: Record<string, string>;
}

export type ProviderConfig =
  OllamaProviderConfig | OpenAICompatibleProviderConfig | CustomApiProviderConfig;
