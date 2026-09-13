import { describe, expect, it } from 'vitest';
import { renderMarkdown, sanitizeUrl } from '../src/markdown/markdown-renderer';

function html(md: string): string {
  const div = document.createElement('div');
  div.appendChild(renderMarkdown(md));
  return div.innerHTML;
}

describe('markdown renderer', () => {
  it('renders block elements', () => {
    const out = html('# Title\n\nPara one\nsame para\n\n- a\n- b\n\n1. x\n2. y\n\n> quote\n\n---');
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<p>Para one same para</p>');
    expect(out).toContain('<ul><li>a</li><li>b</li></ul>');
    expect(out).toContain('<ol><li>x</li><li>y</li></ol>');
    expect(out).toContain('<blockquote><p>quote</p></blockquote>');
    expect(out).toContain('<hr>');
  });

  it('renders inline elements', () => {
    const out = html('**bold** *em* `code` ~~del~~ [link](https://example.com "t") snake_case');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>em</em>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('<del>del</del>');
    expect(out).toContain(
      '<a href="https://example.com/" rel="noopener noreferrer nofollow" target="_blank">link</a>',
    );
    expect(out).toContain('snake_case');
  });

  it('renders fenced code blocks (including unterminated during streaming)', () => {
    const out = html('```js\nconst a = 1;\n```\n\ntext');
    expect(out).toContain(
      '<div class="md-code"><pre><code class="language-js" data-lang="js">const a = 1;</code></pre></div>',
    );
    expect(out).toContain('<p>text</p>');
    expect(html('```\nunterminated <b>')).toContain('unterminated &lt;b&gt;');
  });

  it('renders nested lists', () => {
    const out = html('- a\n  - b\n- c');
    expect(out).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  });

  it('never injects HTML from the source', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> **<b>x</b>**');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<strong>&lt;b&gt;x&lt;/b&gt;</strong>');
  });

  it('blocks unsafe link schemes', () => {
    expect(html('[x](javascript:alert(1))')).toBe('<p><span>x</span></p>');
    expect(html('[x](data:text/html,hi)')).not.toContain('<a');
    expect(html('[x](vbscript:msgbox)')).not.toContain('<a');
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(html('see https://example.com/path.')).toContain('href="https://example.com/path"');
  });
});
