import { icons } from './icons';

export interface ChatInputOptions {
  onSend: (text: string) => void;
  onStop: () => void;
}

export class ChatInput {
  readonly element: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly stopBtn: HTMLButtonElement;
  private streaming = false;

  constructor(
    id: string,
    private readonly options: ChatInputOptions,
  ) {
    const form = document.createElement('form');
    form.className = 'composer';
    form.setAttribute('aria-label', 'Message composer');

    const label = document.createElement('label');
    label.className = 'sr-only';
    label.htmlFor = `${id}-input`;
    label.textContent = 'Message';

    this.textarea = document.createElement('textarea');
    this.textarea.id = `${id}-input`;
    this.textarea.rows = 1;
    this.textarea.autocomplete = 'off';
    this.textarea.setAttribute('enterkeyhint', 'send');
    this.textarea.addEventListener('input', () => this.autosize());
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.submit();
      }
    });

    this.sendBtn = document.createElement('button');
    this.sendBtn.type = 'submit';
    this.sendBtn.className = 'send-btn';
    this.sendBtn.setAttribute('aria-label', 'Send message');
    this.sendBtn.title = 'Send (Enter)';
    this.sendBtn.appendChild(icons.send());

    this.stopBtn = document.createElement('button');
    this.stopBtn.type = 'button';
    this.stopBtn.className = 'stop-btn';
    this.stopBtn.setAttribute('aria-label', 'Stop generating');
    this.stopBtn.title = 'Stop generating';
    this.stopBtn.hidden = true;
    this.stopBtn.appendChild(icons.stop());
    this.stopBtn.addEventListener('click', () => this.options.onStop());

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    form.append(label, this.textarea, this.stopBtn, this.sendBtn);
    this.element = form;
    this.updateButtons();
  }

  setPlaceholder(text: string): void {
    this.textarea.placeholder = text;
  }

  setStreaming(streaming: boolean): void {
    this.streaming = streaming;
    this.updateButtons();
    if (!streaming && this.stopBtn.contains(this.stopBtn.ownerDocument.activeElement)) {
      this.textarea.focus();
    }
  }

  setDisabled(disabled: boolean): void {
    this.textarea.disabled = disabled;
    this.updateButtons();
  }

  focus(): void {
    this.textarea.focus();
  }

  get value(): string {
    return this.textarea.value;
  }

  private submit(): void {
    if (this.streaming) return;
    const text = this.textarea.value.trim();
    if (!text) return;
    this.textarea.value = '';
    this.autosize();
    this.options.onSend(text);
    this.textarea.focus();
  }

  private autosize(): void {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 140)}px`;
  }

  private updateButtons(): void {
    this.stopBtn.hidden = !this.streaming;
    this.sendBtn.hidden = this.streaming;
    this.sendBtn.disabled = this.textarea.disabled;
  }
}
