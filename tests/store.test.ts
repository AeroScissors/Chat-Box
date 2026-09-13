import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../src/state/chat-store';

describe('ChatStore', () => {
  it('adds, streams and completes messages immutably', () => {
    const store = new ChatStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const user = store.addMessage('user', 'hi');
    const assistant = store.addMessage('assistant', '', 'streaming');
    const before = store.getState().messages;
    store.appendContent(assistant.id, 'Hel');
    store.appendContent(assistant.id, 'lo');
    store.setMessageStatus(assistant.id, 'complete');
    const after = store.getState().messages;
    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]); // untouched message keeps identity
    expect(after[1]).toMatchObject({ content: 'Hello', status: 'complete' });
    expect(listener).toHaveBeenCalledTimes(5);
    expect(store.getConversation()).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
    expect(user.role).toBe('user');
  });

  it('excludes errored messages from the conversation and supports retry lookup', () => {
    const store = new ChatStore();
    const u = store.addMessage('user', 'q');
    const a = store.addMessage('assistant', 'partial', 'streaming');
    store.setMessageStatus(a.id, 'error', 'failed');
    expect(store.getConversation()).toEqual([{ role: 'user', content: 'q' }]);
    expect(store.findPrecedingUserMessage(a.id)?.id).toBe(u.id);
    store.removeMessage(a.id);
    expect(store.getState().messages).toHaveLength(1);
  });

  it('clears everything', () => {
    const store = new ChatStore();
    store.addMessage('user', 'x');
    store.setError('bad');
    store.clear();
    expect(store.getState()).toEqual({ messages: [], status: 'idle', error: null });
  });
});
