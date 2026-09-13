/**
 * Entry point. Registers <ai-chat-widget> on load and exports the public API
 * (also available as `window.AIChatWidget` in the IIFE bundle).
 */
import { AIChatWidgetElement, defineChatWidget, TAG_NAME } from './components/ai-chat-widget';

export { AIChatWidgetElement, defineChatWidget, TAG_NAME };
export type { AIChatWidgetEventMap } from './components/ai-chat-widget';
export type {
  WidgetConfig,
  PartialWidgetConfig,
  WidgetTheme,
  WidgetPosition,
} from './config/config';
export type { ChatMessage, ChatRole, WidgetErrorCode } from './types/chat';
export { WidgetError } from './types/chat';
export type {
  LLMProvider,
  ChatOptions,
  ProviderMessage,
  ProviderConfig,
  ProviderKind,
} from './providers/types';
export { OllamaProvider } from './providers/ollama-provider';
export { OpenAICompatibleProvider } from './providers/openai-compatible-provider';
export { CustomApiProvider } from './providers/custom-api-provider';
export { createProvider } from './providers/factory';
export { renderMarkdown } from './markdown/markdown-renderer';

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-widget': AIChatWidgetElement;
  }
  interface Window {
    /** Optional global configuration read by every <ai-chat-widget> on the page. */
    ChatWidgetConfig?: import('./config/config').PartialWidgetConfig;
  }
}

defineChatWidget();
