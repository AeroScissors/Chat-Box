import { icons } from './icons';

export interface FloatingButtonOptions {
  onToggle: () => void;
}

/** The launcher button that stays visible when the chat window is closed. */
export class FloatingButton {
  readonly element: HTMLButtonElement;

  constructor(private readonly options: FloatingButtonOptions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'launcher';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.appendChild(icons.chat());
    btn.appendChild(icons.close());
    btn.addEventListener('click', () => this.options.onToggle());
    this.element = btn;
    this.setLabel('Open chat');
  }

  setOpen(open: boolean, panelId: string): void {
    this.element.setAttribute('aria-expanded', String(open));
    this.element.setAttribute('aria-controls', panelId);
    this.setLabel(open ? 'Close chat' : 'Open chat');
  }

  private setLabel(label: string): void {
    this.element.setAttribute('aria-label', label);
    this.element.title = label;
  }

  focus(): void {
    this.element.focus();
  }
}
