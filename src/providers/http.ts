import { WidgetError } from '../types/chat';
import type { ChatOptions } from './types';

/**
 * Shared HTTP helpers for providers: timeout + abort composition and
 * consistent mapping of fetch/HTTP failures to user-safe WidgetErrors.
 */

export interface TimedSignal {
  signal: AbortSignal;
  /** Call on every received chunk to reset the idle timer. */
  touch(): void;
  dispose(): void;
  timedOut(): boolean;
}

export function createTimedSignal(options: ChatOptions | undefined): TimedSignal {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 60_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;
  const arm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  };
  const upstream = options?.signal;
  const onUpstreamAbort = (): void => controller.abort();
  if (upstream) {
    if (upstream.aborted) controller.abort();
    else upstream.addEventListener('abort', onUpstreamAbort, { once: true });
  }
  arm();
  return {
    signal: controller.signal,
    touch: arm,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer);
      upstream?.removeEventListener('abort', onUpstreamAbort);
    },
    timedOut: () => didTimeout,
  };
}

export async function fetchOrThrow(
  url: string,
  init: RequestInit,
  timed: TimedSignal,
  providerLabel: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: timed.signal });
  } catch (err) {
    throw mapFetchError(err, timed, providerLabel);
  }
  if (!response.ok) {
    throw await mapHttpError(response, providerLabel);
  }
  if (!response.body) {
    throw new WidgetError('malformed-response', `Empty response from ${providerLabel}.`);
  }
  return response;
}

export function mapFetchError(
  err: unknown,
  timed: TimedSignal,
  providerLabel: string,
): WidgetError {
  if (err instanceof WidgetError) return err;
  if (timed.timedOut()) {
    return new WidgetError('timeout', `The request to ${providerLabel} timed out.`);
  }
  if (isAbortError(err)) {
    return new WidgetError('aborted', 'Generation stopped.');
  }
  const detail = err instanceof Error ? err.message : String(err);
  return new WidgetError(
    'connection-failed',
    `Could not connect to ${providerLabel}. Check that the service is running and reachable (CORS/network).`,
    detail,
  );
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export async function mapHttpError(
  response: Response,
  providerLabel: string,
): Promise<WidgetError> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 500);
  } catch {
    /* body unreadable; ignore */
  }
  const status = response.status;
  if (status === 401 || status === 403) {
    return new WidgetError(
      'unauthorized',
      `The request to ${providerLabel} was rejected (unauthorized).`,
      detail,
    );
  }
  if (status === 404) {
    // Ollama returns 404 for unknown models; OpenAI-compatible servers often do too.
    if (/model/i.test(detail)) {
      return new WidgetError('model-unavailable', 'The configured model is not available.', detail);
    }
    return new WidgetError(
      'provider-unavailable',
      `The endpoint for ${providerLabel} was not found (404).`,
      detail,
    );
  }
  if (status === 429) {
    return new WidgetError(
      'server-error',
      `Too many requests to ${providerLabel}. Try again shortly.`,
      detail,
    );
  }
  if (status >= 500) {
    return new WidgetError(
      'server-error',
      `The request to ${providerLabel} failed with a server error (${status}).`,
      detail,
    );
  }
  return new WidgetError(
    'server-error',
    `The request to ${providerLabel} was rejected (${status}).`,
    detail,
  );
}

/** Wraps a stream-consumption error into a WidgetError. */
export function mapStreamError(
  err: unknown,
  timed: TimedSignal,
  providerLabel: string,
): WidgetError {
  if (err instanceof WidgetError) return err;
  if (timed.timedOut())
    return new WidgetError('timeout', `The response from ${providerLabel} timed out.`);
  if (isAbortError(err) || timed.signal.aborted)
    return new WidgetError('aborted', 'Generation stopped.');
  if (err instanceof SyntaxError) {
    return new WidgetError(
      'malformed-response',
      `Received a malformed response from ${providerLabel}.`,
      err.message,
    );
  }
  const detail = err instanceof Error ? err.message : String(err);
  return new WidgetError('stream-interrupted', 'The response stream was interrupted.', detail);
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
