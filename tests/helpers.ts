import { vi } from 'vitest';

/** Builds a byte stream from string chunks, optionally delayed to simulate a network. */
export function streamFrom(chunks: string[], delayMs = 0): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      controller.enqueue(encoder.encode(chunks[i++] ?? ''));
    },
  });
}

export function mockFetchResponse(
  body: ReadableStream<Uint8Array> | string,
  init: { status?: number; contentType?: string } = {},
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    return new Response(body, {
      status: init.status ?? 200,
      headers: { 'Content-Type': init.contentType ?? 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export async function collect(iter: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of iter) out += chunk;
  return out;
}

export function ndjson(objects: unknown[]): string {
  return objects.map((o) => JSON.stringify(o) + '\n').join('');
}

export function sse(objects: Array<unknown | '[DONE]'>): string {
  return objects.map((o) => `data: ${o === '[DONE]' ? '[DONE]' : JSON.stringify(o)}\n\n`).join('');
}

export function flushFrames(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}
