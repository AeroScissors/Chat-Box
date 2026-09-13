import type { ChatMessage } from '../types/chat';

/**
 * localStorage persistence for conversations. Only messages are stored —
 * never configuration or credentials. All access is guarded because storage
 * may be unavailable (private mode, iframes, quota).
 */
export interface ConversationStorage {
  load(): ChatMessage[] | null;
  save(messages: ChatMessage[]): void;
  clear(): void;
}

const SCHEMA_VERSION = 1;
const MAX_MESSAGES = 200;

interface StoredConversation {
  v: number;
  messages: ChatMessage[];
}

export function createLocalStorageConversation(
  key: string,
  storage?: Storage,
): ConversationStorage {
  const store = storage ?? safeLocalStorage();
  return {
    load() {
      if (!store) return null;
      try {
        const raw = store.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!isStoredConversation(parsed)) return null;
        return parsed.messages
          .filter((m) => m.status !== 'streaming')
          .map((m) => ({ ...m, status: m.status ?? 'complete' }));
      } catch {
        return null;
      }
    },
    save(messages) {
      if (!store) return;
      try {
        const persisted = messages
          .filter((m) => m.status !== 'streaming')
          .slice(-MAX_MESSAGES)
          .map(({ id, role, content, timestamp, status, error }) => {
            const m: ChatMessage = { id, role, content };
            if (timestamp !== undefined) m.timestamp = timestamp;
            if (status !== undefined) m.status = status;
            if (error !== undefined) m.error = error;
            return m;
          });
        const payload: StoredConversation = { v: SCHEMA_VERSION, messages: persisted };
        store.setItem(key, JSON.stringify(payload));
      } catch {
        /* quota or disabled storage: persistence is best-effort */
      }
    },
    clear() {
      if (!store) return;
      try {
        store.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function createMemoryConversation(): ConversationStorage {
  let data: ChatMessage[] | null = null;
  return {
    load: () => data,
    save: (m) => {
      data = m.map((x) => ({ ...x }));
    },
    clear: () => {
      data = null;
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__ai_chat_widget_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredConversation(value: unknown): value is StoredConversation {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.v !== SCHEMA_VERSION || !Array.isArray(v.messages)) return false;
  return v.messages.every(isChatMessage);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    (m.role === 'user' || m.role === 'assistant' || m.role === 'system') &&
    typeof m.content === 'string'
  );
}
