import { describe, expect, it } from 'vitest';
import { createLocalStorageConversation } from '../src/persistence/storage';
import type { ChatMessage } from '../src/types/chat';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('conversation persistence', () => {
  it('round-trips messages and drops streaming ones', () => {
    const backing = new MemoryStorage();
    const storage = createLocalStorageConversation('k', backing);
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'hi', timestamp: 1, status: 'complete' },
      { id: '2', role: 'assistant', content: 'partial', status: 'streaming' },
    ];
    storage.save(messages);
    expect(storage.load()).toEqual([messages[0]]);
    storage.clear();
    expect(storage.load()).toBeNull();
  });

  it('rejects corrupt or foreign data', () => {
    const backing = new MemoryStorage();
    backing.setItem('k', '{not json');
    expect(createLocalStorageConversation('k', backing).load()).toBeNull();
    backing.setItem(
      'k',
      JSON.stringify({ v: 1, messages: [{ id: 1, role: 'hacker', content: 5 }] }),
    );
    expect(createLocalStorageConversation('k', backing).load()).toBeNull();
  });

  it('survives a throwing storage backend', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const storage = createLocalStorageConversation('k', throwing);
    expect(() => storage.save([])).not.toThrow();
    expect(storage.load()).toBeNull();
    expect(() => storage.clear()).not.toThrow();
  });
});
