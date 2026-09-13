#!/usr/bin/env node
// Refresh the bundled quote snapshot from Wikiquote.
//
//   node scripts/fetch.mjs            # all catalog sources
//   node scripts/fetch.mjs seneca     # one source id
//
// Writes data/sources/<id>.json (one file per source, so the app only loads
// what the user enabled) and data/index.json (counts + timestamp).
// Run weekly by .github/workflows/refresh-quotes.yml; no dependencies.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SOURCES } from '../src/sources.js';
import { fetchSource } from '../src/wikiquote.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data');
const HEADERS = { 'User-Agent': 'aphorisms-bot/1.0 (https://github.com/carlot78/aphorisms)' };
const DELAY_MS = 800; // be polite to Wikiquote

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const only = process.argv.slice(2);
  const targets = only.length ? SOURCES.filter((s) => only.includes(s.id)) : SOURCES;
  if (!targets.length) throw new Error(`No sources match: ${only.join(', ')}`);

  await mkdir(path.join(OUT, 'sources'), { recursive: true });

  let index = { generated: null, sources: {} };
  try {
    index = JSON.parse(await readFile(path.join(OUT, 'index.json'), 'utf8'));
  } catch {
    /* first run */
  }

  let failures = 0;
  for (const src of targets) {
    try {
      const page = await fetchSource(src.title, { headers: HEADERS });
      const file = path.join(OUT, 'sources', `${src.id}.json`);
      const payload = { id: src.id, title: page.title, url: page.url, fetchedAt: new Date().toISOString(), quotes: page.quotes };
      await writeFile(file, JSON.stringify(payload));
      index.sources[src.id] = { title: page.title, count: page.quotes.length, fetchedAt: payload.fetchedAt };
      console.log(`${src.id.padEnd(22)} ${String(page.quotes.length).padStart(4)} quotes`);
    } catch (err) {
      failures++;
      console.error(`${src.id.padEnd(22)} FAILED: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  index.generated = new Date().toISOString();
  await writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  const total = Object.values(index.sources).reduce((n, s) => n + s.count, 0);
  console.log(`\n${Object.keys(index.sources).length} sources, ${total} quotes, ${failures} failures`);
  if (failures && failures === targets.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
