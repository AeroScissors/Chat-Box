import { icons } from './icons';

export interface ChatHeaderOptions {
  onClose: () => void;
  onClear: () => void;
}

export class ChatHeader {
  readonly element: HTMLElement;
  readonly titleId: string;
  private readonly avatar: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;

  constructor(id: string, options: ChatHeaderOptions) {
    this.titleId = `${id}-title`;
    const header = document.createElement('header');
    header.className = 'header';

    this.avatar = document.createElement('div');
    this.avatar.className = 'header-avatar';
    this.avatar.setAttribute('aria-hidden', 'true');

    const text = document.createElement('div');
    text.className = 'header-text';
    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'header-title';
    this.titleEl.id = this.titleId;
    this.subtitleEl = document.createElement('p');
    this.subtitleEl.className = 'header-subtitle';
    text.append(this.titleEl, this.subtitleEl);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'icon-btn';
    clearBtn.setAttribute('aria-label', 'New conversation');
    clearBtn.title = 'New conversation';
    clearBtn.appendChild(icons.trash());
    clearBtn.addEventListener('click', options.onClear);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'icon-btn';
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.title = 'Close chat';
    closeBtn.appendChild(icons.close());
    closeBtn.addEventListener('click', options.onClose);

    header.append(this.avatar, text, clearBtn, closeBtn);
    this.element = header;
  }

  update(title: string, subtitle: string, logo: string): void {
    this.titleEl.textContent = title;
    this.subtitleEl.textContent = subtitle;
    this.subtitleEl.hidden = subtitle === '';
    this.avatar.replaceChildren();
    if (logo) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = logo;
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => this.avatar.replaceChildren(icons.sparkle()), {
        once: true,
      });
      this.avatar.appendChild(img);
    } else {
      this.avatar.appendChild(icons.sparkle());
    }
  }
}
