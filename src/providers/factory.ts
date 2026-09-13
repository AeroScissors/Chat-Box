import { CustomApiProvider } from './custom-api-provider';
import { OllamaProvider } from './ollama-provider';
import { OpenAICompatibleProvider } from './openai-compatible-provider';
import type { LLMProvider, ProviderConfig } from './types';

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.kind) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai':
      return new OpenAICompatibleProvider(config);
    case 'custom':
      return new CustomApiProvider(config);
  }
}
