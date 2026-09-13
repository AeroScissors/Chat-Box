/**
 * Streaming parsers. Pure functions over a ReadableStream of bytes so they can
 * be unit-tested without a network and reused by any provider.
 */

/** A cancelled reader ends with `done: true`; surface that as an AbortError instead of a silent end. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('The stream was aborted.', 'AbortError');
}

/** Yields complete lines from a byte stream (handles chunk boundaries and CRLF). */
export async function* readLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        yield line;
        nl = buffer.indexOf('\n');
      }
    }
    throwIfAborted(signal);
    buffer += decoder.decode();
    if (buffer.length > 0) yield buffer.replace(/\r$/, '');
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

/** Parses newline-delimited JSON (Ollama style). Skips blank lines; throws on malformed JSON. */
export async function* parseNdjson(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<unknown> {
  for await (const line of readLines(body, signal)) {
    if (line.trim() === '') continue;
    yield JSON.parse(line) as unknown;
  }
}

export interface SseEvent {
  event: string | undefined;
  data: string;
}

/** Parses Server-Sent Events (OpenAI style). Emits one event per blank-line-terminated block. */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  let dataLines: string[] = [];
  let event: string | undefined;
  for await (const line of readLines(body, signal)) {
    if (line === '') {
      if (dataLines.length > 0) {
        yield { event, data: dataLines.join('\n') };
      }
      dataLines = [];
      event = undefined;
      continue;
    }
    if (line.startsWith(':')) continue; // comment / keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
    else if (field === 'event') event = value;
  }
  if (dataLines.length > 0) yield { event, data: dataLines.join('\n') };
}

/** Yields decoded text chunks from a plain text/stream body. */
export async function* readText(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    throwIfAborted(signal);
    const rest = decoder.decode();
    if (rest) yield rest;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
