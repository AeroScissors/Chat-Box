import { describe, expect, it } from 'vitest';
import { parseNdjson, parseSse, readLines } from '../src/streaming/parsers';
import { streamFrom } from './helpers';

async function toArray<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('readLines', () => {
  it('splits lines across arbitrary chunk boundaries', async () => {
    const lines = await toArray(readLines(streamFrom(['ab', 'c\nd', 'e\r\nf', '\n', 'g'])));
    expect(lines).toEqual(['abc', 'de', 'f', 'g']);
  });
  it('handles multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('héllo\n');
    const a = bytes.slice(0, 2);
    const b = bytes.slice(2);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(a);
        c.enqueue(b);
        c.close();
      },
    });
    expect(await toArray(readLines(stream))).toEqual(['héllo']);
  });
});

describe('parseNdjson', () => {
  it('yields one object per line and skips blanks', async () => {
    const objs = await toArray(parseNdjson(streamFrom(['{"a":1}\n\n{"a":', '2}\n'])));
    expect(objs).toEqual([{ a: 1 }, { a: 2 }]);
  });
  it('throws on malformed JSON', async () => {
    await expect(toArray(parseNdjson(streamFrom(['{bad\n'])))).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe('parseSse', () => {
  it('parses events with multi-line data, comments and event names', async () => {
    const src = ': keep-alive\n\nevent: delta\ndata: a\ndata: b\n\ndata: [DONE]\n\n';
    const events = await toArray(parseSse(streamFrom([src.slice(0, 7), src.slice(7)])));
    expect(events).toEqual([
      { event: 'delta', data: 'a\nb' },
      { event: undefined, data: '[DONE]' },
    ]);
  });
  it('emits a trailing event without final blank line', async () => {
    const events = await toArray(parseSse(streamFrom(['data: x'])));
    expect(events).toEqual([{ event: undefined, data: 'x' }]);
  });
});
