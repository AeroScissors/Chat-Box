/**
 * One-off converter: PDF / TXT / MD policy document → policies JSON.
 *
 *   npm run pdf2json -- server/policies/handbook.pdf            → server/policies/handbook.json
 *   npm run pdf2json -- handbook.pdf out.json --category hr
 *
 * The output uses the same shape as policies.json, so you can review the
 * sections, fix titles, edit content and add keywords by hand. Drop the JSON
 * into server/policies/ (and remove the PDF) — the proxy loads it directly,
 * no PDF parsing at startup.
 */
import { writeFileSync } from 'node:fs';
import { basename, extname, dirname, join } from 'node:path';
import { loadDocument } from './documents.mjs';
import { commonWords, deriveKeywords } from './knowledge.mjs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
if (files.length === 0) {
  console.error('usage: node server/pdf-to-json.mjs <file.pdf> [out.json] [--category name]');
  process.exit(1);
}

const [input, outArg] = files;
const output = outArg ?? join(dirname(input), `${basename(input, extname(input))}.json`);
const policies = await loadDocument(input, flag('category'));
const common = commonWords(policies);
const withKeywords = policies.map(({ id, category, title, content }) => ({
  id,
  category,
  title,
  keywords: deriveKeywords({ title, content }, common),
  content,
}));
writeFileSync(output, `${JSON.stringify({ policies: withKeywords }, null, 2)}\n`);
console.log(
  `${input} → ${output} (${withKeywords.length} policies). Review titles/keywords, then drop it in server/policies/.`,
);
