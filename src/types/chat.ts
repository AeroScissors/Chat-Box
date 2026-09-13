export type ChatRole = 'system' | 'user' | 'assistant';

export type MessageStatus = 'complete' | 'streaming' | 'error';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp?: number;
  /** UI-only status; not sent to providers. */
  status?: MessageStatus;
  /** User-facing error text when status === 'error'. */
  error?: string;
}

export type WidgetErrorCode =
  | 'invalid-config'
  | 'connection-failed'
  | 'model-unavailable'
  | 'provider-unavailable'
  | 'timeout'
  | 'aborted'
  | 'stream-interrupted'
  | 'server-error'
  | 'malformed-response'
  | 'empty-response'
  | 'unauthorized';

/** Error type used across providers and the UI. `message` is safe to show to users. */
export class WidgetError extends Error {
  readonly code: WidgetErrorCode;
  /** Developer-facing detail (never rendered in the UI). */
  readonly detail: string | undefined;
  constructor(code: WidgetErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'WidgetError';
    this.code = code;
    this.detail = detail;
  }
}
