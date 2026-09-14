/**
 * Policy documents source: every `.pdf`, `.txt`, `.md` or `.json` file in a folder
 * (default `server/policies/`) is read, split into sections by its headings and
 * turned into policies `{ id, category, title, content, source: 'documents' }`
 * for knowledge.mjs. Keywords are derived automatically.
 *
 * Drop a company handbook PDF in the folder and restart (or just wait — the
 * folder is watched and reloaded on change).
 */
import { readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { basename, extname, join } from 'node:path';

const MAX_CHUNK = 1500; // chars, for documents without recognisable headings
const MIN_SECTION = 40; // sections shorter than this (cover titles etc.) are dropped

/** Extracts plain text from a PDF buffer via pdf-parse (loaded lazily so it stays optional). */
async function pdfToText(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ pageJoiner: '\n\n' });
    return result.text ?? '';
  } finally {
    await parser.destroy?.();
  }
}

/** A line looks like a heading: short, no sentence punctuation, numbered / Title Case / ALL CAPS. */
export function isHeading(line) {
  const s = line.trim();
  if (s.length < 3 || s.length > 90) return false;
  if (/[.;,:]$/.test(s) || /\.{4,}/.test(s)) return false; // sentences, list intros, TOC dot leaders
  if (/^(page\s+)?\d+(\s+of\s+\d+)?$/i.test(s)) return false; // page numbers
  // "2. Password Policy", "17.6. Routers, Hubs and Switches", "Section 3: Leave", "A) Scope"
  const numbered =
    /^(\d+(\.\d+)*[.)]?|[A-Z][.)]|(section|chapter|article|part)\s+\d+:?)\s+(.+)$/i.exec(s);
  const text = numbered ? numbered[4] : s;
  if (/^[A-Z][A-Z0-9 &/\-:(),]+$/.test(text) && /[A-Z]{3}/.test(text)) return true;
  return titleCase(text);
}

function titleCase(s) {
  if (/\.\s/.test(s)) return false; // contains a sentence boundary
  const words = s.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length === 0 || words.length > 10) return false;
  const caps = words.filter(
    (w) => /^[A-Z(]/.test(w) || /^(a|an|and|of|the|for|to|in|on|or|&|vs|by|with)$/i.test(w),
  );
  return caps.length === words.length && /^[A-Z]/.test(words[0]);
}

/** Drops running page headers/footers: short lines repeated on many pages, and "Page | n" markers. */
function stripRunningLines(lines) {
  const counts = new Map();
  for (const l of lines) {
    const t = l.trim();
    if (t && t.length < 80) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return lines.filter((l) => {
    const t = l.trim();
    if (/^p\s?a\s?g\s?e\b.*\d+$/i.test(t)) return false;
    return !(counts.get(t) >= 3 && !/^\d+(\.\d+)*[.)]?\s/.test(t));
  });
}

/** Splits document text into `{ title, content }` sections. */
export function splitSections(text, fallbackTitle) {
  const lines = stripRunningLines(text.replace(/\r/g, '').replace(/\f/g, '\n').split('\n'));
  const sections = [];
  let current = { title: fallbackTitle, body: [] };
  for (const line of lines) {
    if (isHeading(line)) {
      sections.push(current);
      current = { title: line.trim().replace(/\s+/g, ' '), body: [] };
    } else current.body.push(line);
  }
  sections.push(current);

  const cleaned = sections
    .map((s) => ({ title: s.title, content: paragraphs(s.body) }))
    .filter((s) => s.content.length >= MIN_SECTION);
  if (cleaned.length >= 2) return cleaned;

  // No usable headings: chunk the whole text by paragraphs instead.
  const whole = paragraphs(lines);
  const chunks = [];
  let buf = '';
  for (const para of whole.split('\n\n')) {
    if (buf && buf.length + para.length > MAX_CHUNK) {
      chunks.push(buf);
      buf = '';
    }
    buf = buf ? `${buf}\n\n${para}` : para;
  }
  if (buf) chunks.push(buf);
  return chunks
    .filter((c) => c.length >= MIN_SECTION)
    .map((content, i) => ({
      title: chunks.length > 1 ? `${fallbackTitle} (part ${i + 1})` : fallbackTitle,
      content,
    }));
}

/** Re-flows PDF line breaks into paragraphs (blank line = paragraph break). */
function paragraphs(lines) {
  return lines
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/\s*\n\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n');
}

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const EXTENSIONS = ['.pdf', '.txt', '.md', '.json'];

/**
 * Loads one file and returns its policies. `.json` files use the policies.json
 * shape (`{ policies: [{ id, title, content, keywords?, category? }] }`) — the
 * output of pdf-to-json.mjs — and are taken as-is, no parsing or splitting.
 */
export async function loadDocument(path, category) {
  const file = basename(path);
  const ext = extname(file).toLowerCase();
  const cat = category ?? slug(basename(file, ext));
  if (ext === '.json') {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed?.policies;
    if (!Array.isArray(list)) throw new Error('expected { "policies": [...] }');
    return list.map((p, i) => {
      if (typeof p.title !== 'string' || typeof p.content !== 'string')
        throw new Error(`policy #${i + 1} needs string title and content`);
      return { category: cat, ...p, id: String(p.id ?? `${cat}-${i + 1}`), source: 'documents' };
    });
  }
  const text = ext === '.pdf' ? await pdfToText(readFileSync(path)) : readFileSync(path, 'utf8');
  return splitSections(text, basename(file, ext)).map((s, i) => ({
    id: `${cat}-${i + 1}`,
    category: cat,
    title: s.title,
    content: s.content,
    source: 'documents',
  }));
}

/** Loads all supported documents in `dir` and returns policies. */
export async function loadDocuments(dir) {
  const policies = [];
  const files = readdirSync(dir)
    .filter((f) => EXTENSIONS.includes(extname(f).toLowerCase()))
    .sort();
  const names = new Set(files.map((f) => f.toLowerCase()));
  for (const file of files) {
    const path = join(dir, file);
    if (!statSync(path).isFile()) continue;
    const ext = extname(file).toLowerCase();
    // A converted copy (pdf-to-json.mjs) next to the original wins; the PDF is not parsed again.
    if (ext !== '.json' && names.has(`${basename(file, extname(file)).toLowerCase()}.json`)) {
      console.log(`documents: ${file} skipped (using the converted .json)`);
      continue;
    }
    try {
      const loaded = await loadDocument(path);
      policies.push(...loaded);
      console.log(`documents: ${file} → ${loaded.length} section(s)`);
    } catch (err) {
      console.error(`documents: failed to read ${file}:`, err.message);
    }
  }
  return policies;
}

/**
 * Loads the folder now and again whenever a file in it changes.
 * `onLoad(policies)` receives the full list each time.
 */
export async function watchDocuments(dir, onLoad) {
  onLoad(await loadDocuments(dir));
  let timer;
  try {
    watch(dir, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const policies = await loadDocuments(dir);
          onLoad(policies);
          console.log(`documents reloaded (${policies.length} sections)`);
        } catch (err) {
          console.error('documents reload failed:', err.message);
        }
      }, 500);
    });
  } catch {
    /* watching is best-effort */
  }
}
