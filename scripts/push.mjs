#!/usr/bin/env node
// Send the day's thought as a Web Push notification.
//
// Runs hourly from .github/workflows/daily-push.yml. Reads:
//   PUSH_CONFIG        JSON pasted from the app's Notifications tab:
//                      { hour, timeZone, lang, sources: [ids], subscriptions: [...] }
//   VAPID_PRIVATE_KEY  private half of the key in src/push-config.js
//   FORCE=true         send now regardless of the hour (workflow_dispatch)
//
// The quote is picked from the bundled snapshot (data/sources/<id>.json) for
// the configured sources, with the same "one bucket per source" rule the app
// uses, seeded by the date so re-runs on the same day send the same quote.
// Requires the `web-push` package (installed by the workflow, not vendored).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import webpush from 'web-push';
import { SOURCES } from '../src/sources.js';
import { hash } from '../src/wikiquote.js';
import { translate } from '../src/translate.js';
import { VAPID_PUBLIC_KEY, PUSH_SUBJECT } from '../src/push-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localParts(timeZone, date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

async function loadPool(ids) {
  const buckets = [];
  for (const id of ids) {
    try {
      const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'sources', `${id}.json`), 'utf8'));
      if (data.quotes?.length) buckets.push(data.quotes.map((q) => ({ ...q, sourceId: id })));
    } catch {
      // custom sources and "own" have no snapshot — skipped
    }
  }
  return buckets;
}

async function main() {
  const raw = process.env.PUSH_CONFIG?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!raw || !privateKey) {
    console.log('Push not configured (PUSH_CONFIG / VAPID_PRIVATE_KEY missing) — nothing to do.');
    return;
  }
  const config = JSON.parse(raw);
  const timeZone = config.timeZone || 'UTC';
  const { day, hour } = localParts(timeZone);
  const force = process.env.FORCE === 'true';
  if (!force && hour !== Number(config.hour)) {
    console.log(`It is ${hour}:xx in ${timeZone}; configured hour is ${config.hour}. Skipping.`);
    return;
  }

  const buckets = await loadPool(config.sources || []);
  if (!buckets.length) throw new Error('No snapshot quotes for the configured sources.');
  const rng = mulberry32(parseInt(hash(`${day}|push`), 16));
  const bucket = buckets[Math.floor(rng() * buckets.length)];
  const quote = bucket[Math.floor(rng() * bucket.length)];
  const who = SOURCES.find((s) => s.id === quote.sourceId)?.name || quote.source;

  let translation = '';
  if (config.lang) {
    try {
      translation = await translate(quote.text, config.lang);
    } catch (err) {
      console.warn(`Translation failed: ${err.message}`);
    }
  }

  const payload = {
    date: day,
    title: 'Thought for today',
    body: `“${quote.text}” — ${who}`,
    quote,
    translation,
    lang: config.lang || '',
    url: './',
  };
  console.log(`${day} → ${who}: ${quote.text.slice(0, 80)}…`);

  webpush.setVapidDetails(PUSH_SUBJECT, VAPID_PUBLIC_KEY, privateKey);
  let sent = 0;
  for (const sub of config.subscriptions || []) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 12 * 3600, urgency: 'normal' });
      sent++;
    } catch (err) {
      const gone = err.statusCode === 404 || err.statusCode === 410;
      console.error(`${gone ? 'Expired subscription' : 'Push failed'} (${err.statusCode || err.message}): ${sub.endpoint?.slice(0, 60)}…`);
    }
  }
  console.log(`Sent to ${sent} of ${(config.subscriptions || []).length} device(s).`);
  if (!sent) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
