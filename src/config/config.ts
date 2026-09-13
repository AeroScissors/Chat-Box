import type { ProviderConfig, ProviderKind } from '../providers/types';
import type { LLMProvider } from '../providers/types';

export type WidgetTheme = 'light' | 'dark' | 'system';
export type WidgetPosition = 'bottom-right' | 'bottom-left';

/**
 * Public configuration. Everything here is considered PUBLIC (it lives in the
 * browser). `apiKey` is accepted for local development only — see README.
 */
export interface WidgetConfig {
  provider: ProviderKind;
  model: string;
  /** OpenAI-compatible base URL (e.g. https://api.openai.com/v1) or custom endpoint URL. */
  apiEndpoint: string;
  apiKey: string;
  ollamaUrl: string;
  /** Extra headers to send with every provider request. */
  headers: Record<string, string>;
  title: string;
  subtitle: string;
  logo: string;
  position: WidgetPosition;
  theme: WidgetTheme;
  primaryColor: string;
  width: string;
  height: string;
  welcomeMessage: string;
  placeholder: string;
  systemPrompt: string;
  persistConversation: boolean;
  storageKey: string;
  /** Request/idle timeout in ms. */
  timeoutMs: number;
  temperature: number | undefined;
  /** Open the window automatically on load. */
  openOnLoad: boolean;
  /** Bypass built-in providers entirely with a custom LLMProvider (JS only). */
  customProvider: LLMProvider | undefined;
}

export type PartialWidgetConfig = Partial<WidgetConfig>;

export const DEFAULT_CONFIG: WidgetConfig = {
  provider: 'ollama',
  model: '',
  apiEndpoint: '',
  apiKey: '',
  ollamaUrl: 'http://localhost:11434',
  headers: {},
  title: 'AI Assistant',
  subtitle: '',
  logo: '',
  position: 'bottom-right',
  theme: 'system',
  primaryColor: '#2563eb',
  width: '400px',
  height: '600px',
  welcomeMessage: 'Hi! How can I help you today?',
  placeholder: 'Type your message…',
  systemPrompt: '',
  persistConversation: false,
  storageKey: 'ai-chat-widget:conversation',
  timeoutMs: 60_000,
  temperature: undefined,
  openOnLoad: false,
  customProvider: undefined,
};

/** HTML attribute name → config key. */
export const ATTRIBUTE_MAP: Readonly<Record<string, keyof WidgetConfig>> = {
  provider: 'provider',
  model: 'model',
  'api-endpoint': 'apiEndpoint',
  'api-key': 'apiKey',
  'ollama-url': 'ollamaUrl',
  title: 'title',
  subtitle: 'subtitle',
  logo: 'logo',
  position: 'position',
  theme: 'theme',
  'primary-color': 'primaryColor',
  width: 'width',
  height: 'height',
  'welcome-message': 'welcomeMessage',
  placeholder: 'placeholder',
  'system-prompt': 'systemPrompt',
  'persist-conversation': 'persistConversation',
  'storage-key': 'storageKey',
  'timeout-ms': 'timeoutMs',
  temperature: 'temperature',
  'open-on-load': 'openOnLoad',
};

export const OBSERVED_ATTRIBUTES: readonly string[] = Object.keys(ATTRIBUTE_MAP);

/** Converts an attribute string to the typed config value for `key`. */
export function coerceAttribute(key: keyof WidgetConfig, raw: string | null): unknown {
  if (raw === null) return undefined;
  switch (key) {
    case 'persistConversation':
    case 'openOnLoad':
      return raw === '' || raw === 'true' || raw === '1';
    case 'timeoutMs': {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    case 'temperature': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'headers':
    case 'customProvider':
      return undefined; // JS-only
    default:
      return raw;
  }
}

const PROVIDER_KINDS: readonly ProviderKind[] = ['ollama', 'openai', 'custom'];
const THEMES: readonly WidgetTheme[] = ['light', 'dark', 'system'];
const POSITIONS: readonly WidgetPosition[] = ['bottom-right', 'bottom-left'];

/** Merges defaults ← global config ← attributes ← JS config, dropping undefined values. */
export function resolveConfig(...layers: Array<PartialWidgetConfig | undefined>): WidgetConfig {
  const merged: WidgetConfig = { ...DEFAULT_CONFIG };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v;
    }
  }
  if (!PROVIDER_KINDS.includes(merged.provider)) merged.provider = DEFAULT_CONFIG.provider;
  if (!THEMES.includes(merged.theme)) merged.theme = DEFAULT_CONFIG.theme;
  if (!POSITIONS.includes(merged.position)) merged.position = DEFAULT_CONFIG.position;
  return merged;
}

export interface ConfigValidation {
  ok: boolean;
  /** User-facing message when !ok. */
  message?: string;
}

/** Validates the parts of config needed to make a request. */
export function validateConfig(config: WidgetConfig): ConfigValidation {
  if (config.customProvider) return { ok: true };
  switch (config.provider) {
    case 'ollama':
      if (!config.model)
        return {
          ok: false,
          message: 'No model configured. Set the `model` attribute (e.g. gemma3:4b).',
        };
      if (!isHttpUrl(config.ollamaUrl))
        return { ok: false, message: 'Invalid `ollama-url`. Expected an http(s) URL.' };
      return { ok: true };
    case 'openai':
      if (!isHttpUrl(config.apiEndpoint))
        return {
          ok: false,
          message:
            'Set `api-endpoint` to an OpenAI-compatible base URL (e.g. https://api.openai.com/v1).',
        };
      if (!config.model)
        return { ok: false, message: 'No model configured. Set the `model` attribute.' };
      return { ok: true };
    case 'custom':
      if (!isHttpUrl(config.apiEndpoint))
        return {
          ok: false,
          message:
            'Set `api-endpoint` to your chat endpoint URL (e.g. https://example.com/api/chat).',
        };
      return { ok: true };
  }
}

export function toProviderConfig(config: WidgetConfig): ProviderConfig {
  switch (config.provider) {
    case 'ollama':
      return {
        kind: 'ollama',
        baseUrl: config.ollamaUrl,
        model: config.model,
        headers: config.headers,
      };
    case 'openai': {
      const c: ProviderConfig = {
        kind: 'openai',
        baseUrl: config.apiEndpoint,
        model: config.model,
        headers: config.headers,
      };
      if (config.apiKey) c.apiKey = config.apiKey;
      return c;
    }
    case 'custom': {
      const c: ProviderConfig = {
        kind: 'custom',
        endpoint: config.apiEndpoint,
        headers: config.headers,
      };
      if (config.model) c.model = config.model;
      return c;
    }
  }
}

/** Accepts absolute http(s) URLs, or root-relative paths (`/api/chat`) resolved against the page. */
export function isHttpUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('/') && !v.startsWith('//')) return typeof location !== 'undefined';
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Reads `window.ChatWidgetConfig` if present and well-formed. */
export function readGlobalConfig(): PartialWidgetConfig | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = (window as unknown as { ChatWidgetConfig?: unknown }).ChatWidgetConfig;
  if (typeof raw !== 'object' || raw === null) return undefined;
  return raw as PartialWidgetConfig;
}
