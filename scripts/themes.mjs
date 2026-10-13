#!/usr/bin/env node
// Build data/themes/<id>.json from the per-source snapshot in data/sources/.
// Run after scripts/fetch.mjs (the weekly refresh workflow does both).
//
// Each theme file holds up to MAX_PER_THEME quotes, taken round-robin across
// sources so every author is represented rather than the most prolific ones.
// Within a source, quotes with more theme words come first (most pertinent),
// then shorter ones (aphorisms over long passages).

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { THEMES, themeScore } from '../src/themes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'sources');
const OUT = path.join(ROOT, 'data', 'themes');
const MAX_PER_THEME = 400;

const files = (await readdir(SRC)).filter((f) => f.endsWith('.json'));
const sources = [];
for (const f of files) {
  const data = JSON.parse(await readFile(path.join(SRC, f), 'utf8'));
  sources.push({ id: data.id, quotes: data.quotes.map((q) => ({ ...q, sourceId: data.id })) });
}

await mkdir(OUT, { recursive: true });
const index = { generated: new Date().toISOString(), themes: {} };
for (const theme of THEMES) {
  const perSource = sources
    .map((s) =>
      s.quotes
        .map((q) => ({ q, score: themeScore(theme, q.text) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.q.text.length - b.q.text.length)
        .map((x) => x.q)
    )
    .filter((l) => l.length);
  const picked = [];
  for (let round = 0; picked.length < MAX_PER_THEME; round++) {
    let added = false;
    for (const list of perSource) {
      if (round < list.length && picked.length < MAX_PER_THEME) {
        picked.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  await writeFile(path.join(OUT, `${theme.id}.json`), JSON.stringify({ id: theme.id, generated: index.generated, quotes: picked }));
  index.themes[theme.id] = { count: picked.length, authors: perSource.length };
  console.log(`${theme.id.padEnd(12)} ${String(picked.length).padStart(4)} quotes from ${perSource.length} authors`);
}
await writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
