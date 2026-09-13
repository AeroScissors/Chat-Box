import { renderMarkdown } from '../markdown/markdown-renderer';
import type { ChatMessage } from '../types/chat';
import { icons } from './icons';

export interface ChatMessagesOptions {
  onRetry: (assistantMessageId: string) => void;
}

/**
 * Renders the message list. Keeps one DOM node per message id and only
 * re-renders nodes whose message object changed (store snapshots are immutable).
 */
export class ChatMessages {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly liveRegion: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly nodes = new Map<string, { el: HTMLElement; message: ChatMessage }>();
  private typingEl: HTMLElement | null = null;
  private renderScheduled = false;
  private pending: ChatMessage[] = [];
  private stickToBottom = true;

  constructor(private readonly options: ChatMessagesOptions) {
    const wrapper = document.createElement('div');
    wrapper.className = 'messages';
    wrapper.setAttribute('role', 'log');
    wrapper.setAttribute('aria-label', 'Conversation');
    wrapper.setAttribute('aria-live', 'off');
    wrapper.tabIndex = 0;

    this.banner = document.createElement('div');
    this.banner.className = 'banner';
    this.banner.setAttribute('role', 'alert');
    this.banner.hidden = true;

    this.list = wrapper;
    this.liveRegion = document.createElement('div');
    this.liveRegion.className = 'sr-only';
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');

    wrapper.addEventListener('scroll', () => {
      const distance = wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight;
      this.stickToBottom = distance < 48;
    });

    this.element = wrapper;
    wrapper.appendChild(this.banner);
    wrapper.appendChild(this.liveRegion);
  }

  setBanner(text: string | null): void {
    this.banner.textContent = text ?? '';
    this.banner.hidden = text === null;
  }

  /** Batches renders to one per animation frame (streaming can deliver many deltas). */
  render(messages: ChatMessage[], streaming: boolean): void {
    this.pending = messages;
    this.setTyping(
      streaming && !messages.some((m) => m.status === 'streaming' && m.content.length > 0),
    );
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    // rAF is paused in hidden tabs, so a timer fallback guarantees the flush.
    let raf = 0;
    const run = (): void => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(timer);
      this.renderScheduled = false;
      this.flush();
    };
    const timer = setTimeout(run, 50);
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(run);
  }

  announce(text: string): void {
    this.liveRegion.textContent = '';
    // Force screen readers to notice identical consecutive announcements.
    setTimeout(() => {
      this.liveRegion.textContent = text;
    }, 30);
  }

  scrollToBottom(force = false): void {
    if (!force && !this.stickToBottom) return;
    this.list.scrollTop = this.list.scrollHeight;
  }

  private flush(): void {
    const messages = this.pending.filter((m) => m.role !== 'system');
    const seen = new Set<string>();
    // Fixed prefix: banner, live region. Messages follow in order; typing indicator last.
    let index = 2;
    for (const message of messages) {
      seen.add(message.id);
      const existing = this.nodes.get(message.id);
      let el: HTMLElement;
      if (existing) {
        el = existing.el;
        if (existing.message !== message) {
          this.updateMessageNode(el, message);
          existing.message = message;
        }
      } else {
        el = this.createMessageNode(message);
        this.nodes.set(message.id, { el, message });
      }
      const current = this.list.children[index] ?? null;
      if (current !== el) this.list.insertBefore(el, current);
      index++;
    }
    for (const [id, entry] of this.nodes) {
      if (!seen.has(id)) {
        entry.el.remove();
        this.nodes.delete(id);
      }
    }
    if (this.typingEl) this.list.appendChild(this.typingEl);
    this.scrollToBottom();
  }

  private setTyping(show: boolean): void {
    if (show && !this.typingEl) {
      const wrap = document.createElement('div');
      wrap.className = 'message';
      wrap.dataset.role = 'assistant';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      const dots = document.createElement('div');
      dots.className = 'typing';
      dots.setAttribute('role', 'status');
      dots.setAttribute('aria-label', 'Assistant is typing');
      dots.append(
        document.createElement('span'),
        document.createElement('span'),
        document.createElement('span'),
      );
      bubble.appendChild(dots);
      wrap.appendChild(bubble);
      this.typingEl = wrap;
      this.list.appendChild(wrap);
      this.scrollToBottom();
    } else if (!show && this.typingEl) {
      this.typingEl.remove();
      this.typingEl = null;
    }
  }

  private createMessageNode(message: ChatMessage): HTMLElement {
    const wrap = document.createElement('article');
    wrap.className = 'message';
    wrap.dataset.role = message.role;
    wrap.dataset.id = message.id;
    wrap.setAttribute('aria-label', message.role === 'user' ? 'You' : 'Assistant');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    wrap.appendChild(bubble);
    this.updateMessageNode(wrap, message);
    return wrap;
  }

  private updateMessageNode(wrap: HTMLElement, message: ChatMessage): void {
    const bubble = wrap.querySelector<HTMLElement>('.bubble');
    if (!bubble) return;
    wrap.dataset.status = message.status ?? 'complete';
    if (message.status === 'error') {
      bubble.classList.remove('cursor');
      bubble.replaceChildren(document.createTextNode(message.error ?? 'Something went wrong.'));
      if (message.content) {
        const partial = document.createElement('div');
        partial.style.marginTop = '8px';
        partial.style.color = 'var(--acw-fg)';
        partial.appendChild(renderMarkdown(message.content, { onCodeBlock: decorateCodeBlock }));
        bubble.prepend(partial);
      }
      this.ensureActions(wrap, message);
      return;
    }
    if (message.role === 'user') {
      bubble.textContent = message.content;
    } else {
      bubble.replaceChildren(renderMarkdown(message.content, { onCodeBlock: decorateCodeBlock }));
      bubble.classList.toggle('cursor', message.status === 'streaming');
    }
    wrap.querySelector('.message-actions')?.remove();
  }

  private ensureActions(wrap: HTMLElement, message: ChatMessage): void {
    if (wrap.querySelector('.message-actions')) return;
    if (message.role !== 'assistant') return;
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'text-btn';
    retry.append(icons.refresh(), document.createTextNode(' Retry'));
    retry.addEventListener('click', () => this.options.onRetry(message.id));
    actions.appendChild(retry);
    wrap.appendChild(actions);
  }
}

/** Adds a language label + copy button to a fenced code block. */
export function decorateCodeBlock(wrapper: HTMLElement, code: string, language: string): void {
  const bar = document.createElement('div');
  bar.className = 'md-code-bar';
  const lang = document.createElement('span');
  lang.textContent = language || 'code';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'md-code-copy';
  copy.setAttribute('aria-label', 'Copy code');
  const setLabel = (text: string, icon: SVGSVGElement): void => {
    copy.replaceChildren(icon, document.createTextNode(text));
  };
  setLabel('Copy', icons.copy());
  copy.addEventListener('click', async () => {
    const ok = await copyText(code);
    setLabel(ok ? 'Copied' : 'Failed', ok ? icons.check() : icons.copy());
    setTimeout(() => setLabel('Copy', icons.copy()), 1500);
  });
  bar.append(lang, copy);
  wrapper.prepend(bar);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
