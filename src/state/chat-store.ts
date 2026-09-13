import type { ChatMessage, ChatRole, MessageStatus } from '../types/chat';

export type ChatStatus = 'idle' | 'streaming';

export interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Global (non-message) error shown in the UI, e.g. invalid config. */
  error: string | null;
}

export type Listener = (state: ChatState) => void;

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Minimal observable store. Messages are immutable snapshots; every mutation
 * produces a new array so the UI can diff cheaply by identity.
 */
export class ChatStore {
  private state: ChatState = { messages: [], status: 'idle', error: null };
  private readonly listeners = new Set<Listener>();

  getState(): ChatState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMessages(messages: ChatMessage[]): void {
    this.update({ messages: [...messages] });
  }

  addMessage(role: ChatRole, content: string, status: MessageStatus = 'complete'): ChatMessage {
    const message: ChatMessage = { id: createId(), role, content, timestamp: Date.now(), status };
    this.update({ messages: [...this.state.messages, message] });
    return message;
  }

  appendContent(id: string, delta: string): void {
    this.patch(id, (m) => ({ ...m, content: m.content + delta }));
  }

  setMessageStatus(id: string, status: MessageStatus, error?: string): void {
    this.patch(id, (m) => {
      const next: ChatMessage = { ...m, status };
      if (error !== undefined) next.error = error;
      else delete next.error;
      return next;
    });
  }

  removeMessage(id: string): void {
    this.update({ messages: this.state.messages.filter((m) => m.id !== id) });
  }

  /** Removes the given message and everything after it. */
  truncateFrom(id: string): void {
    const idx = this.state.messages.findIndex((m) => m.id === id);
    if (idx === -1) return;
    this.update({ messages: this.state.messages.slice(0, idx) });
  }

  setStatus(status: ChatStatus): void {
    if (this.state.status !== status) this.update({ status });
  }

  setError(error: string | null): void {
    if (this.state.error !== error) this.update({ error });
  }

  clear(): void {
    this.update({ messages: [], status: 'idle', error: null });
  }

  /** Messages in wire format (system/user/assistant with content only). */
  getConversation(): Array<{ role: ChatRole; content: string }> {
    return this.state.messages
      .filter((m) => m.status !== 'error' && m.content.length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  /** Last user message that precedes the given assistant message (for retry). */
  findPrecedingUserMessage(assistantId: string): ChatMessage | undefined {
    const idx = this.state.messages.findIndex((m) => m.id === assistantId);
    for (let i = (idx === -1 ? this.state.messages.length : idx) - 1; i >= 0; i--) {
      const m = this.state.messages[i];
      if (m && m.role === 'user') return m;
    }
    return undefined;
  }

  private patch(id: string, fn: (m: ChatMessage) => ChatMessage): void {
    let changed = false;
    const messages = this.state.messages.map((m) => {
      if (m.id !== id) return m;
      changed = true;
      return fn(m);
    });
    if (changed) this.update({ messages });
  }

  private update(partial: Partial<ChatState>): void {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l(this.state);
  }
}
