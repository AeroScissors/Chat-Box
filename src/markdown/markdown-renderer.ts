/**
 * Safe Markdown → DOM renderer.
 *
 * Builds DOM nodes directly (never innerHTML), so model output can never inject
 * markup. Raw HTML in the source is shown as literal text. Links are limited to
 * http(s)/mailto and open in a new tab with rel="noopener noreferrer nofollow".
 *
 * Supported: paragraphs, headings (#..######), bold, italic, strikethrough,
 * inline code, fenced code blocks, unordered/ordered lists (nested by indent),
 * links, blockquotes, horizontal rules, hard line breaks.
 */

export interface RenderOptions {
  /** Called for each fenced code block so the host can add a copy button etc. */
  onCodeBlock?: (wrapper: HTMLElement, code: string, language: string) => void;
  /** Add `target="_blank"` to links (default true). */
  openLinksInNewTab?: boolean;
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'h'; level: number; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'quote'; lines: string[] }
  | { type: 'hr' }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] };

interface ListItem {
  text: string;
  children: Block[];
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function renderMarkdown(source: string, options: RenderOptions = {}): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const blocks = parseBlocks(normalize(source).split('\n'));
  for (const block of blocks) fragment.appendChild(renderBlock(block, options));
  return fragment;
}

function normalize(src: string): string {
  return src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
}

/* ---------------------------------- blocks -------------------------------- */

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const UL_RE = /^(\s*)[-*+]\s+(.*)$/;
const OL_RE = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE_RE = /^ {0,3}>\s?(.*)$/;

function isBlockStart(l: string): boolean {
  return (
    FENCE_RE.test(l) ||
    HEADING_RE.test(l) ||
    HR_RE.test(l) ||
    QUOTE_RE.test(l) ||
    UL_RE.test(l) ||
    OL_RE.test(l)
  );
}

export function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = (fence[1] ?? '```').charAt(0);
      const lang = fence[2] ?? '';
      const code: string[] = [];
      i++;
      while (i < lines.length) {
        const l = lines[i] ?? '';
        const close = FENCE_CLOSE_RE.exec(l);
        if (close && (close[1] ?? '').charAt(0) === marker) break;
        code.push(l);
        i++;
      }
      i++; // skip closing fence (or run off the end while streaming)
      blocks.push({ type: 'code', lang, code: code.join('\n') });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'h', level: (heading[1] ?? '#').length, text: heading[2] ?? '' });
      i++;
      continue;
    }
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length) {
        const m = QUOTE_RE.exec(lines[i] ?? '');
        if (!m) break;
        quoted.push(m[1] ?? '');
        i++;
      }
      blocks.push({ type: 'quote', lines: quoted });
      continue;
    }
    if (UL_RE.test(line) || OL_RE.test(line)) {
      const result = parseList(lines, i);
      blocks.push(result.block);
      i = result.next;
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (l.trim() === '' || isBlockStart(l)) break;
      para.push(l);
      i++;
    }
    blocks.push({ type: 'p', lines: para });
  }
  return blocks;
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
  const first = lines[start] ?? '';
  const ordered = OL_RE.test(first) && !UL_RE.test(first);
  const firstMatch = ordered ? OL_RE.exec(first) : UL_RE.exec(first);
  const baseIndent = (firstMatch?.[1] ?? '').length;
  const startNum = ordered ? Number(firstMatch?.[2] ?? '1') : 1;
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const m = ordered ? OL_RE.exec(line) : UL_RE.exec(line);
    if (!m || (m[1] ?? '').length !== baseIndent) break;
    const text = ordered ? (m[3] ?? '') : (m[2] ?? '');
    i++;
    const nested: string[] = [];
    const contLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (l.trim() === '') {
        const peek = lines[i + 1] ?? '';
        if (peek.trim() !== '' && leadingSpaces(peek) > baseIndent) {
          nested.push('');
          i++;
          continue;
        }
        break;
      }
      const ind = leadingSpaces(l);
      if (ind > baseIndent) {
        nested.push(l.slice(Math.min(ind, baseIndent + 2)));
        i++;
        continue;
      }
      if (ind === baseIndent && !isBlockStart(l)) {
        contLines.push(l.trim());
        i++;
        continue;
      }
      break;
    }
    items.push({
      text: [text, ...contLines].join(' '),
      children: nested.length ? parseBlocks(nested) : [],
    });
  }
  if (items.length === 0) return { block: { type: 'p', lines: [first] }, next: start + 1 };
  return { block: { type: 'list', ordered, start: startNum, items }, next: i };
}

function leadingSpaces(s: string): number {
  return s.length - s.trimStart().length;
}

/* -------------------------------- rendering ------------------------------- */

function renderBlock(block: Block, options: RenderOptions): Node {
  switch (block.type) {
    case 'p': {
      const p = document.createElement('p');
      appendInlineLines(p, block.lines, options);
      return p;
    }
    case 'h': {
      const h = document.createElement(`h${block.level}`);
      appendInline(h, block.text, options);
      return h;
    }
    case 'hr':
      return document.createElement('hr');
    case 'quote': {
      const q = document.createElement('blockquote');
      for (const b of parseBlocks(block.lines)) q.appendChild(renderBlock(b, options));
      return q;
    }
    case 'code': {
      const wrapper = document.createElement('div');
      wrapper.className = 'md-code';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (block.lang) {
        code.className = `language-${block.lang.replace(/[^\w+#.-]/g, '')}`;
        code.dataset.lang = block.lang;
      }
      code.textContent = block.code;
      pre.appendChild(code);
      wrapper.appendChild(pre);
      options.onCodeBlock?.(wrapper, block.code, block.lang);
      return wrapper;
    }
    case 'list': {
      const list = document.createElement(block.ordered ? 'ol' : 'ul');
      if (block.ordered && block.start !== 1) list.setAttribute('start', String(block.start));
      for (const item of block.items) {
        const li = document.createElement('li');
        appendInline(li, item.text, options);
        for (const child of item.children) li.appendChild(renderBlock(child, options));
        list.appendChild(li);
      }
      return list;
    }
  }
}

function appendInlineLines(parent: HTMLElement, lines: string[], options: RenderOptions): void {
  lines.forEach((line, idx) => {
    const hardBreak = /( {2,}|\\)$/.test(line);
    appendInline(parent, hardBreak ? line.replace(/( {2,}|\\)$/, '') : line, options);
    if (idx < lines.length - 1) {
      parent.appendChild(hardBreak ? document.createElement('br') : document.createTextNode(' '));
    }
  });
}

/* --------------------------------- inline --------------------------------- */

/**
 * Inline tokenizer. Processes left→right, handling (in priority order):
 * escapes, code spans, links, autolinks, bold (** / __), strike (~~), italic (* / _).
 */
export function appendInline(parent: Node, text: string, options: RenderOptions): void {
  let buffer = '';
  const flush = (): void => {
    if (buffer) {
      parent.appendChild(document.createTextNode(buffer));
      buffer = '';
    }
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text.charAt(i);

    if (ch === '\\' && i + 1 < n && /[\\`*_{}[\]()#+\-.!~>|<]/.test(text.charAt(i + 1))) {
      buffer += text.charAt(i + 1);
      i += 2;
      continue;
    }

    if (ch === '`') {
      let ticks = 0;
      while (text.charAt(i + ticks) === '`') ticks++;
      const closer = '`'.repeat(ticks);
      const end = text.indexOf(closer, i + ticks);
      if (end !== -1) {
        flush();
        const code = document.createElement('code');
        code.textContent = text.slice(i + ticks, end).replace(/^ (.*) $/, '$1');
        parent.appendChild(code);
        i = end + ticks;
        continue;
      }
      buffer += closer;
      i += ticks;
      continue;
    }

    if (ch === '[') {
      const link = matchLink(text, i);
      if (link) {
        flush();
        parent.appendChild(createLink(link.label, link.url, options));
        i = link.end;
        continue;
      }
    }

    if (ch === '<') {
      const m = /^<((?:https?|mailto):[^\s>]+)>/.exec(text.slice(i));
      if (m && m[1]) {
        flush();
        parent.appendChild(createLink(m[1], m[1], options, true));
        i += m[0].length;
        continue;
      }
    }
    if ((ch === 'h' || ch === 'H') && /^https?:\/\//i.test(text.slice(i, i + 8))) {
      const m = /^https?:\/\/[^\s<]+?(?=[.,;:!?)]*(?:\s|$))/i.exec(text.slice(i));
      if (m) {
        flush();
        parent.appendChild(createLink(m[0], m[0], options, true));
        i += m[0].length;
        continue;
      }
    }

    const em = matchEmphasis(text, i);
    if (em) {
      flush();
      const el = document.createElement(em.tag);
      appendInline(el, em.inner, options);
      parent.appendChild(el);
      i = em.end;
      continue;
    }

    buffer += ch;
    i++;
  }
  flush();
}

interface LinkMatch {
  label: string;
  url: string;
  end: number;
}

function matchLink(text: string, start: number): LinkMatch | null {
  let depth = 0;
  let j = start;
  for (; j < text.length; j++) {
    const c = text.charAt(j);
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (j >= text.length || text.charAt(j + 1) !== '(') return null;
  const label = text.slice(start + 1, j);
  let k = j + 2;
  let pdepth = 1;
  for (; k < text.length; k++) {
    const c = text.charAt(k);
    if (c === '\\') {
      k++;
      continue;
    }
    if (c === '(') pdepth++;
    else if (c === ')') {
      pdepth--;
      if (pdepth === 0) break;
    }
  }
  if (k >= text.length) return null;
  const dest = text.slice(j + 2, k).trim();
  const url = dest.replace(/\s+("|').*("|')$/, '').replace(/^<(.*)>$/, '$1');
  return { label, url, end: k + 1 };
}

interface EmphasisMatch {
  tag: 'strong' | 'em' | 'del';
  inner: string;
  end: number;
}

const EMPHASIS_MARKERS: ReadonlyArray<{ marker: string; tag: EmphasisMatch['tag'] }> = [
  { marker: '**', tag: 'strong' },
  { marker: '__', tag: 'strong' },
  { marker: '~~', tag: 'del' },
  { marker: '*', tag: 'em' },
  { marker: '_', tag: 'em' },
];

function matchEmphasis(text: string, i: number): EmphasisMatch | null {
  const rest = text.slice(i);
  for (const { marker, tag } of EMPHASIS_MARKERS) {
    if (!rest.startsWith(marker)) continue;
    const after = rest.charAt(marker.length);
    if (after === '' || /\s/.test(after) || after === marker.charAt(0)) continue;
    if (marker.charAt(0) === '_' && i > 0 && /\w/.test(text.charAt(i - 1))) continue;
    const close = findCloser(rest, marker);
    if (close === -1) continue;
    const inner = rest.slice(marker.length, close);
    if (inner.trim() === '' || /\s$/.test(inner)) continue;
    if (marker.charAt(0) === '_' && /\w/.test(rest.charAt(close + marker.length))) continue;
    return { tag, inner, end: i + close + marker.length };
  }
  return null;
}

function findCloser(rest: string, marker: string): number {
  let idx = rest.indexOf(marker, marker.length);
  while (idx !== -1) {
    const before = rest.charAt(idx - 1);
    const after = rest.charAt(idx + marker.length);
    if (before !== '\\' && !/\s/.test(before) && (marker.length === 2 || after !== marker))
      return idx;
    idx = rest.indexOf(marker, idx + 1);
  }
  return -1;
}

export function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const base = typeof location !== 'undefined' ? location.href : 'https://localhost/';
    const parsed = new URL(trimmed, base);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** `plainLabel` skips inline parsing of the label (used for autolinks, whose label is the URL). */
function createLink(label: string, url: string, options: RenderOptions, plainLabel = false): Node {
  const safe = sanitizeUrl(url);
  const target = safe ? document.createElement('a') : document.createElement('span');
  if (safe && target instanceof HTMLAnchorElement) {
    target.href = safe;
    target.rel = 'noopener noreferrer nofollow';
    if (options.openLinksInNewTab !== false) target.target = '_blank';
  }
  if (plainLabel) target.textContent = label;
  else appendInline(target, label, options);
  return target;
}
