import {
  ATTRIBUTE_MAP,
  OBSERVED_ATTRIBUTES,
  coerceAttribute,
  readGlobalConfig,
  resolveConfig,
  toProviderConfig,
  validateConfig,
  type PartialWidgetConfig,
  type WidgetConfig,
} from '../config/config';
import { createProvider } from '../providers/factory';
import type { LLMProvider } from '../providers/types';
import {
  createLocalStorageConversation,
  createMemoryConversation,
  type ConversationStorage,
} from '../persistence/storage';
import { ChatStore } from '../state/chat-store';
import styles from '../styles/widget.css?inline';
import { WidgetError, type ChatMessage } from '../types/chat';
import { ChatHeader } from './chat-header';
import { ChatInput } from './chat-input';
import { ChatMessages } from './chat-messages';
import { FloatingButton } from './floating-button';

/** Events dispatched by <ai-chat-widget>. All bubble and are composed. */
export interface AIChatWidgetEventMap {
  'chat-open': CustomEvent<void>;
  'chat-close': CustomEvent<void>;
  'message-sent': CustomEvent<{ message: ChatMessage }>;
  'response-start': CustomEvent<{ messageId: string }>;
  'response-complete': CustomEvent<{ message: ChatMessage }>;
  'conversation-cleared': CustomEvent<void>;
  error: CustomEvent<{ code: string; message: string }>;
}

let instanceCounter = 0;
let sharedSheet: CSSStyleSheet | null = null;

function getSharedSheet(): CSSStyleSheet | null {
  if (sharedSheet) return sharedSheet;
  try {
    if (typeof CSSStyleSheet === 'undefined' || !('replaceSync' in CSSStyleSheet.prototype))
      return null;
    sharedSheet = new CSSStyleSheet();
    sharedSheet.replaceSync(styles);
    return sharedSheet;
  } catch {
    return null;
  }
}

export class AIChatWidgetElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [...OBSERVED_ATTRIBUTES];
  }

  private readonly store = new ChatStore();
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly button: FloatingButton;
  private readonly header: ChatHeader;
  private readonly messages: ChatMessages;
  private readonly input: ChatInput;
  private readonly instanceId = `acw-${++instanceCounter}`;
  private readonly mediaQuery: MediaQueryList | null;

  private jsConfig: PartialWidgetConfig = {};
  private config: WidgetConfig;
  private provider: LLMProvider | null = null;
  private storage: ConversationStorage = createMemoryConversation();
  private abortController: AbortController | null = null;
  private opened = false;
  private connected = false;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const sheet = getSharedSheet();
    if (sheet && 'adoptedStyleSheets' in shadow) {
      shadow.adoptedStyleSheets = [sheet];
    } else {
      const style = document.createElement('style');
      style.textContent = styles;
      shadow.appendChild(style);
    }

    this.root = document.createElement('div');
    this.root.className = 'root';
    this.root.dataset.open = 'false';

    this.button = new FloatingButton({ onToggle: () => this.toggle() });
    this.header = new ChatHeader(this.instanceId, {
      onClose: () => this.close(),
      onClear: () => this.clearConversation(),
    });
    this.messages = new ChatMessages({ onRetry: (id) => void this.retry(id) });
    this.input = new ChatInput(this.instanceId, {
      onSend: (text) => void this.sendMessage(text),
      onStop: () => this.stopGeneration(),
    });

    this.panel = document.createElement('section');
    this.panel.className = 'panel';
    this.panel.id = `${this.instanceId}-panel`;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-labelledby', this.header.titleId);
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    this.panel.append(this.header.element, this.messages.element, this.input.element);
    this.root.append(this.panel, this.button.element);
    shadow.appendChild(this.root);

    this.mediaQuery =
      typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    this.config = resolveConfig();
  }

  /* ------------------------------ lifecycle ------------------------------ */

  connectedCallback(): void {
    this.connected = true;
    this.unsubscribe = this.store.subscribe((state) => {
      this.messages.render(state.messages, state.status === 'streaming');
      this.messages.setBanner(state.error);
      this.input.setStreaming(state.status === 'streaming');
    });
    this.mediaQuery?.addEventListener('change', this.onSchemeChange);
    this.applyConfig();
    if (this.config.openOnLoad) this.open();
  }

  disconnectedCallback(): void {
    this.connected = false;
    this.stopGeneration();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.mediaQuery?.removeEventListener('change', this.onSchemeChange);
  }

  attributeChangedCallback(): void {
    if (this.connected) this.applyConfig();
  }

  private readonly onSchemeChange = (): void => this.applyTheme();

  /* ------------------------------ public API ----------------------------- */

  /** Merge JavaScript configuration (takes precedence over attributes). */
  setConfig(config: PartialWidgetConfig): void {
    this.jsConfig = { ...this.jsConfig, ...config };
    if (this.connected) this.applyConfig();
  }

  getConfig(): Readonly<WidgetConfig> {
    return this.config;
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.root.dataset.open = 'true';
    this.panel.setAttribute('aria-hidden', 'false');
    this.button.setOpen(true, this.panel.id);
    this.messages.scrollToBottom(true);
    // Focus after the panel is visible so screen readers announce the dialog.
    setTimeout(() => this.input.focus(), 0);
    this.emit('chat-open', undefined);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.dataset.open = 'false';
    this.panel.setAttribute('aria-hidden', 'true');
    this.button.setOpen(false, this.panel.id);
    this.button.focus();
    this.emit('chat-close', undefined);
  }

  toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  getMessages(): ChatMessage[] {
    return this.store.getState().messages.map((m) => ({ ...m }));
  }

  clearConversation(): void {
    this.stopGeneration();
    this.store.clear();
    this.storage.clear();
    this.seedWelcome();
    this.emit('conversation-cleared', undefined);
  }

  stopGeneration(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async sendMessage(text: string): Promise<void> {
    const content = text.trim();
    if (!content || this.store.getState().status === 'streaming') return;
    const validation = validateConfig(this.config);
    if (!validation.ok || !this.provider) {
      this.store.setError(validation.message ?? 'The chat widget is not configured.');
      this.emit('error', {
        code: 'invalid-config',
        message: validation.message ?? 'Invalid configuration',
      });
      return;
    }
    this.store.setError(null);
    const userMessage = this.store.addMessage('user', content);
    this.emit('message-sent', { message: userMessage });
    await this.generate();
  }

  /* ------------------------------ internals ------------------------------ */

  private async retry(assistantId: string): Promise<void> {
    if (this.store.getState().status === 'streaming') return;
    const user = this.store.findPrecedingUserMessage(assistantId);
    if (!user) return;
    this.store.removeMessage(assistantId);
    await this.generate();
  }

  private async generate(): Promise<void> {
    if (!this.provider) return;
    const controller = new AbortController();
    this.abortController = controller;
    this.store.setStatus('streaming');
    const assistant = this.store.addMessage('assistant', '', 'streaming');
    this.emit('response-start', { messageId: assistant.id });

    const conversation = this.store
      .getConversation()
      .filter((m) => !(m.role === 'assistant' && m.content === ''));
    const wire = this.config.systemPrompt
      ? [{ role: 'system' as const, content: this.config.systemPrompt }, ...conversation]
      : conversation;

    try {
      const options: Parameters<LLMProvider['streamChat']>[1] = {
        signal: controller.signal,
        timeoutMs: this.config.timeoutMs,
      };
      if (this.config.temperature !== undefined) options.temperature = this.config.temperature;
      for await (const delta of this.provider.streamChat(wire, options)) {
        if (controller.signal.aborted) break;
        if (delta) this.store.appendContent(assistant.id, delta);
      }
      const final = this.store.getState().messages.find((m) => m.id === assistant.id);
      if (controller.signal.aborted) {
        this.finishAborted(assistant.id, final?.content ?? '');
      } else if (!final || final.content.trim() === '') {
        this.failMessage(
          assistant.id,
          new WidgetError('empty-response', 'The model returned an empty response.'),
        );
      } else {
        this.store.setMessageStatus(assistant.id, 'complete');
        this.messages.announce(`Assistant: ${final.content}`);
        this.emit('response-complete', { message: { ...final, status: 'complete' } });
      }
    } catch (err) {
      const partial =
        this.store.getState().messages.find((m) => m.id === assistant.id)?.content ?? '';
      if (controller.signal.aborted || (err instanceof WidgetError && err.code === 'aborted')) {
        this.finishAborted(assistant.id, partial);
      } else {
        this.failMessage(assistant.id, err);
      }
    } finally {
      if (this.abortController === controller) this.abortController = null;
      this.store.setStatus('idle');
      this.persist();
    }
  }

  private finishAborted(id: string, partial: string): void {
    if (partial.trim() === '') {
      this.store.removeMessage(id);
    } else {
      this.store.setMessageStatus(id, 'complete');
    }
    this.messages.announce('Generation stopped.');
  }

  private failMessage(id: string, err: unknown): void {
    const widgetErr =
      err instanceof WidgetError
        ? err
        : new WidgetError(
            'provider-unavailable',
            'Something went wrong while contacting the AI service.',
            err instanceof Error ? err.message : String(err),
          );
    if (widgetErr.detail && import.meta.env.DEV) {
      console.warn(`[ai-chat-widget] ${widgetErr.code}: ${widgetErr.detail}`);
    }
    this.store.setMessageStatus(id, 'error', widgetErr.message);
    this.messages.announce(`Error: ${widgetErr.message}`);
    this.emit('error', { code: widgetErr.code, message: widgetErr.message });
  }

  private applyConfig(): void {
    const attrConfig: PartialWidgetConfig = {};
    for (const [attr, key] of Object.entries(ATTRIBUTE_MAP)) {
      const value = coerceAttribute(key, this.getAttribute(attr));
      if (value !== undefined) (attrConfig as Record<string, unknown>)[key] = value;
    }
    const previous = this.config;
    this.config = resolveConfig(readGlobalConfig(), attrConfig, this.jsConfig);

    if (this.config.apiKey && import.meta.env.DEV) {
      console.warn(
        '[ai-chat-widget] An API key is configured in the browser. Use a backend proxy in production.',
      );
    }

    this.provider = this.buildProvider();
    const validation = validateConfig(this.config);
    this.store.setError(validation.ok ? null : (validation.message ?? null));

    this.header.update(this.config.title, this.config.subtitle, this.config.logo);
    this.input.setPlaceholder(this.config.placeholder);
    this.root.dataset.position = this.config.position;
    this.root.dataset.resizable = 'true';
    this.root.style.setProperty('--acw-width', this.config.width);
    this.root.style.setProperty('--acw-height', this.config.height);
    this.root.style.setProperty('--acw-primary', this.config.primaryColor);
    this.applyTheme();

    const storageChanged =
      previous.persistConversation !== this.config.persistConversation ||
      previous.storageKey !== this.config.storageKey ||
      !this.storageInitialized;
    if (storageChanged) this.initStorage();
    if (previous.welcomeMessage !== this.config.welcomeMessage) this.seedWelcome();
  }

  private storageInitialized = false;

  private initStorage(): void {
    this.storageInitialized = true;
    this.storage = this.config.persistConversation
      ? createLocalStorageConversation(this.config.storageKey)
      : createMemoryConversation();
    const restored = this.storage.load();
    if (restored && restored.length > 0) {
      this.store.setMessages(restored);
    } else {
      this.seedWelcome();
    }
  }

  private seedWelcome(): void {
    const current = this.store.getState().messages;
    const onlyWelcome =
      current.length === 0 || (current.length === 1 && current[0]?.id === 'welcome');
    if (!onlyWelcome) return;
    if (!this.config.welcomeMessage) {
      if (current.length === 1) this.store.setMessages([]);
      return;
    }
    this.store.setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: this.config.welcomeMessage,
        timestamp: Date.now(),
        status: 'complete',
      },
    ]);
  }

  private persist(): void {
    const messages = this.store.getState().messages.filter((m) => m.id !== 'welcome');
    this.storage.save(messages);
  }

  private buildProvider(): LLMProvider | null {
    if (this.config.customProvider) return this.config.customProvider;
    if (!validateConfig(this.config).ok) return null;
    try {
      return createProvider(toProviderConfig(this.config));
    } catch {
      return null;
    }
  }

  private applyTheme(): void {
    const theme = this.config.theme;
    const dark = theme === 'dark' || (theme === 'system' && this.mediaQuery?.matches === true);
    this.root.dataset.theme = dark ? 'dark' : 'light';
  }

  private emit<K extends keyof AIChatWidgetEventMap>(
    type: K,
    detail: AIChatWidgetEventMap[K]['detail'],
  ): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

export const TAG_NAME = 'ai-chat-widget';

export function defineChatWidget(tagName: string = TAG_NAME): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, AIChatWidgetElement);
}
