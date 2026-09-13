import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AIChatWidgetElement } from '../src/index';
import type { LLMProvider, ProviderMessage } from '../src/providers/types';
import { WidgetError } from '../src/types/chat';
import { flushFrames } from './helpers';

function fakeProvider(
  chunks: string[],
  opts: { delayMs?: number; failWith?: WidgetError } = {},
): LLMProvider & { calls: ProviderMessage[][] } {
  const calls: ProviderMessage[][] = [];
  return {
    name: 'fake',
    calls,
    async *streamChat(messages, options) {
      calls.push(messages);
      if (opts.failWith) throw opts.failWith;
      for (const c of chunks) {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        if (options?.signal?.aborted) throw new WidgetError('aborted', 'Generation stopped.');
        yield c;
      }
    },
  };
}

function mount(attrs: Record<string, string> = {}): AIChatWidgetElement {
  const el = document.createElement('ai-chat-widget');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

function shadowText(el: AIChatWidgetElement, selector: string): string {
  return el.shadowRoot?.querySelector(selector)?.textContent ?? '';
}

async function waitFor(fn: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timeout');
    await flushFrames();
  }
}

beforeAll(async () => {
  await import('../src/index');
});

afterEach(() => {
  document.body.innerHTML = '';
  delete window.ChatWidgetConfig;
  localStorage.clear();
});

describe('<ai-chat-widget> initialization', () => {
  it('registers without any framework globals', () => {
    expect(customElements.get('ai-chat-widget')).toBeDefined();
    expect((globalThis as Record<string, unknown>).React).toBeUndefined();
    expect((globalThis as Record<string, unknown>).Vue).toBeUndefined();
  });

  it('renders in a shadow root with launcher and hidden panel', () => {
    const el = mount({ title: 'Helper', model: 'm' });
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.launcher')?.getAttribute('aria-label')).toBe('Open chat');
    expect(el.shadowRoot?.querySelector('.panel')?.getAttribute('aria-hidden')).toBe('true');
    expect(shadowText(el, '.header-title')).toBe('Helper');
    expect(el.querySelector('*')).toBeNull(); // nothing leaks into light DOM
  });

  it('reads window.ChatWidgetConfig, attributes and setConfig in precedence order', () => {
    window.ChatWidgetConfig = { title: 'Global', subtitle: 'sub', model: 'g' };
    const el = mount({ title: 'Attr' });
    expect(el.getConfig().title).toBe('Attr');
    expect(el.getConfig().subtitle).toBe('sub');
    el.setConfig({ title: 'JS' });
    expect(el.getConfig().title).toBe('JS');
    expect(shadowText(el, '.header-title')).toBe('JS');
    el.setAttribute('title', 'Attr2');
    expect(el.getConfig().title).toBe('JS'); // JS config still wins
  });

  it('shows a configuration error instead of crashing', async () => {
    const el = mount({ provider: 'ollama' }); // no model
    await flushFrames();
    expect(shadowText(el, '.banner')).toMatch(/model/i);
  });
});

describe('open/close behaviour', () => {
  it('toggles via API and launcher with events and aria state', () => {
    const el = mount({ model: 'm' });
    const opened = vi.fn();
    const closed = vi.fn();
    el.addEventListener('chat-open', opened);
    el.addEventListener('chat-close', closed);
    el.open();
    expect(el.isOpen).toBe(true);
    expect(el.shadowRoot?.querySelector('.root')?.getAttribute('data-open')).toBe('true');
    expect(el.shadowRoot?.querySelector('.launcher')?.getAttribute('aria-expanded')).toBe('true');
    el.close();
    expect(el.isOpen).toBe(false);
    (el.shadowRoot?.querySelector('.launcher') as HTMLButtonElement).click();
    expect(el.isOpen).toBe(true);
    expect(opened).toHaveBeenCalledTimes(2);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const el = mount({ model: 'm' });
    el.open();
    el.shadowRoot
      ?.querySelector('.panel')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(el.isOpen).toBe(false);
  });
});

describe('messaging', () => {
  it('streams a response through a custom provider and emits events', async () => {
    const el = mount({ 'welcome-message': '' });
    const provider = fakeProvider(['Hel', 'lo **world**']);
    el.setConfig({ customProvider: provider, systemPrompt: 'be nice' });
    const events: string[] = [];
    for (const t of ['message-sent', 'response-start', 'response-complete'])
      el.addEventListener(t, () => events.push(t));
    await el.sendMessage('hi');
    await flushFrames();
    const msgs = el.getMessages();
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[1]?.content).toBe('Hello **world**');
    expect(msgs[1]?.status).toBe('complete');
    expect(provider.calls[0]).toEqual([
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'hi' },
    ]);
    expect(events).toEqual(['message-sent', 'response-start', 'response-complete']);
    const bubbles = el.shadowRoot?.querySelectorAll('.message');
    expect(bubbles?.length).toBe(2);
    expect(
      el.shadowRoot?.querySelector('.message[data-role="assistant"] strong')?.textContent,
    ).toBe('world');
  });

  it('sends via the composer with Enter and ignores empty input', async () => {
    const el = mount({ 'welcome-message': '' });
    el.setConfig({ customProvider: fakeProvider(['ok']) });
    const ta = el.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = '   ';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(el.getMessages()).toHaveLength(0);
    ta.value = 'question';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(
      () => el.getMessages().length === 2 && el.getMessages()[1]?.status === 'complete',
    );
    expect(ta.value).toBe('');
  });

  it('stop generation keeps partial output and shows the stop button while streaming', async () => {
    const el = mount({ 'welcome-message': '' });
    el.setConfig({ customProvider: fakeProvider(['a', 'b', 'c', 'd'], { delayMs: 30 }) });
    const done = el.sendMessage('go');
    await waitFor(() => (el.getMessages()[1]?.content.length ?? 0) >= 1);
    expect((el.shadowRoot?.querySelector('.stop-btn') as HTMLButtonElement).hidden).toBe(false);
    el.stopGeneration();
    await done;
    const last = el.getMessages()[1];
    expect(last?.status).toBe('complete');
    expect(last?.content.length).toBeLessThan(4);
    expect((el.shadowRoot?.querySelector('.stop-btn') as HTMLButtonElement).hidden).toBe(true);
  });

  it('surfaces provider errors as an error message with retry, and emits error', async () => {
    const el = mount({ 'welcome-message': '' });
    el.setConfig({
      customProvider: fakeProvider([], {
        failWith: new WidgetError('connection-failed', 'Could not connect.'),
      }),
    });
    const onError = vi.fn();
    el.addEventListener('error', onError);
    await el.sendMessage('hi');
    await flushFrames();
    const last = el.getMessages()[1];
    expect(last?.status).toBe('error');
    expect(last?.error).toBe('Could not connect.');
    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]?.[0] as CustomEvent).detail.code).toBe('connection-failed');
    expect(el.shadowRoot?.querySelector('.message-actions .text-btn')).not.toBeNull();

    // Retry with a working provider re-sends the same user message.
    const good = fakeProvider(['fixed']);
    el.setConfig({ customProvider: good });
    (el.shadowRoot?.querySelector('.message-actions .text-btn') as HTMLButtonElement).click();
    await waitFor(() => el.getMessages()[1]?.status === 'complete');
    expect(el.getMessages()[1]?.content).toBe('fixed');
    expect(good.calls[0]).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('treats an empty response as an error', async () => {
    const el = mount({ 'welcome-message': '' });
    el.setConfig({ customProvider: fakeProvider(['', '  ']) });
    await el.sendMessage('hi');
    expect(el.getMessages()[1]?.status).toBe('error');
  });

  it('clearConversation resets to the welcome message', async () => {
    const el = mount({ 'welcome-message': 'Welcome!' });
    el.setConfig({ customProvider: fakeProvider(['x']) });
    await el.sendMessage('hi');
    expect(el.getMessages()).toHaveLength(3);
    el.clearConversation();
    expect(el.getMessages().map((m) => m.content)).toEqual(['Welcome!']);
  });
});

describe('persistence', () => {
  it('restores conversation after re-mount when enabled', async () => {
    const el = mount({
      'persist-conversation': '',
      'storage-key': 'test-key',
      'welcome-message': '',
    });
    el.setConfig({ customProvider: fakeProvider(['answer']) });
    await el.sendMessage('remember me');
    el.remove();
    const again = mount({
      'persist-conversation': '',
      'storage-key': 'test-key',
      'welcome-message': '',
    });
    expect(again.getMessages().map((m) => m.content)).toEqual(['remember me', 'answer']);
    expect(localStorage.getItem('test-key')).not.toContain('apiKey');
  });

  it('does not persist by default', async () => {
    const el = mount({ 'welcome-message': '' });
    el.setConfig({ customProvider: fakeProvider(['x']) });
    await el.sendMessage('hi');
    expect(localStorage.length).toBe(0);
  });
});
