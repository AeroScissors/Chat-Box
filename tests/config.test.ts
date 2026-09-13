import { describe, expect, it } from 'vitest';
import {
  coerceAttribute,
  DEFAULT_CONFIG,
  resolveConfig,
  toProviderConfig,
  validateConfig,
} from '../src/config/config';

describe('configuration', () => {
  it('merges layers with later layers winning and ignores undefined', () => {
    const c = resolveConfig({ title: 'A', model: 'x' }, { title: 'B', model: undefined } as never, {
      theme: 'dark',
    });
    expect(c.title).toBe('B');
    expect(c.model).toBe('x');
    expect(c.theme).toBe('dark');
    expect(c.ollamaUrl).toBe(DEFAULT_CONFIG.ollamaUrl);
  });

  it('falls back on invalid enum values', () => {
    const c = resolveConfig({
      provider: 'nope' as never,
      theme: 'neon' as never,
      position: 'top' as never,
    });
    expect(c.provider).toBe('ollama');
    expect(c.theme).toBe('system');
    expect(c.position).toBe('bottom-right');
  });

  it('coerces attribute strings', () => {
    expect(coerceAttribute('persistConversation', '')).toBe(true);
    expect(coerceAttribute('persistConversation', 'false')).toBe(false);
    expect(coerceAttribute('timeoutMs', '1500')).toBe(1500);
    expect(coerceAttribute('timeoutMs', 'abc')).toBeUndefined();
    expect(coerceAttribute('temperature', '0.3')).toBe(0.3);
    expect(coerceAttribute('title', 'Hi')).toBe('Hi');
    expect(coerceAttribute('title', null)).toBeUndefined();
  });

  it('validates per provider', () => {
    expect(validateConfig(resolveConfig({ provider: 'ollama' })).ok).toBe(false);
    expect(validateConfig(resolveConfig({ provider: 'ollama', model: 'm' })).ok).toBe(true);
    expect(
      validateConfig(resolveConfig({ provider: 'ollama', model: 'm', ollamaUrl: 'ftp://x' })).ok,
    ).toBe(false);
    expect(validateConfig(resolveConfig({ provider: 'openai', model: 'm' })).ok).toBe(false);
    expect(
      validateConfig(resolveConfig({ provider: 'openai', model: 'm', apiEndpoint: 'https://a/v1' }))
        .ok,
    ).toBe(true);
    expect(validateConfig(resolveConfig({ provider: 'custom' })).ok).toBe(false);
    expect(
      validateConfig(resolveConfig({ provider: 'custom', apiEndpoint: 'https://a/api/chat' })).ok,
    ).toBe(true);
  });

  it('maps to provider configs without leaking unrelated fields', () => {
    const c = resolveConfig({
      provider: 'openai',
      model: 'm',
      apiEndpoint: 'https://a/v1',
      apiKey: 'k',
    });
    expect(toProviderConfig(c)).toEqual({
      kind: 'openai',
      baseUrl: 'https://a/v1',
      model: 'm',
      apiKey: 'k',
      headers: {},
    });
    const o = resolveConfig({ provider: 'ollama', model: 'm', apiKey: 'k' });
    expect(toProviderConfig(o)).toEqual({
      kind: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'm',
      headers: {},
    });
  });
});
