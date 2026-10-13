#!/usr/bin/env node
// Send each subscriber their daily thought as a Web Push notification.
//
// Run by .github/workflows/daily-push.yml (hourly, best-effort). Reads:
//   VAPID_PRIVATE_KEY    private half of the key in src/push-config.js
//   SUPABASE_SECRET_KEY  the project's secret key — reads push_subscriptions
//   FORCE=true           send to everyone now, even if already sent today
//
// Subscriptions are saved by the app itself (Settings → Daily reminder) via
// the save_push function in supabase/push.sql. A reminder is due on the first
// run at or after the subscriber's hour in their time zone, once per local
// day (tracked in push_subscriptions.last_sent). Expired subscriptions
// (404/410 from the push service) are deleted.
//
// The quote comes from the weekly snapshot (data/themes, data/sources) for
// the subscriber's themes and followed authors, tilted by community votes,
// seeded by day + device so re-runs pick the same thought.
// Requires the `web-push` package (installed by the workflow, not vendored).

import { readFile } from 'node:fs/promises';
import { createECDH } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import webpush from 'web-push';
import { SOURCES } from '../src/sources.js';
import { hash } from '../src/wikiquote.js';
import { translate } from '../src/translate.js';
import { VAPID_PUBLIC_KEY, PUSH_SUBJECT } from '../src/push-config.js';
import { pickPersonal } from '../src/taste.js';
import { fetchScores } from '../src/community.js';
import { SUPABASE_URL } from '../src/community-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local calendar day and hour in a time zone (UTC if the zone is unknown). */
function localNow(timeZone, date = new Date()) {
  let tz = timeZone || 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = 'UTC'; }
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, nowHour: Number(p.hour) % 24 };
}

const fileCache = new Map();
async function loadList(dir, id) {
  const key = `${dir}/${id}`;
  if (!fileCache.has(key)) {
    try {
      const data = JSON.parse(await readFile(path.join(ROOT, 'data', dir, `${id}.json`), 'utf8'));
      fileCache.set(key, dir === 'themes' ? data.quotes : data.quotes.map((q) => ({ ...q, sourceId: id })));
    } catch {
      fileCache.set(key, null); // custom sources have no snapshot
    }
  }
  return fileCache.get(key);
}

async function poolFor(sub) {
  const lists = [
    ...(await Promise.all((sub.themes || []).map((id) => loadList('themes', id)))),
    ...(await Promise.all((sub.sources || []).map((id) => loadList('sources', id)))),
  ];
  return lists.filter((l) => l?.length);
}

function publicFromPrivate(privateKey) {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  return ecdh.getPublicKey().toString('base64url');
}

/** Supabase REST with the secret key (bypasses row level security). */
const db = (secret) => async (pathAndQuery, { method = 'GET', body } = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: secret, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${pathAndQuery.split('?')[0]}: HTTP ${res.status} ${await res.text()}`);
  return method === 'GET' ? res.json() : null;
};

async function main() {
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  const force = process.env.FORCE === 'true';
  const missing = [!privateKey && 'VAPID_PRIVATE_KEY', !secret && 'SUPABASE_SECRET_KEY'].filter(Boolean);
  if (missing.length) {
    console.log(`::warning title=Daily reminder not configured::Repository secret ${missing.join(' and ')} missing — no reminders are sent. See README "Daily reminder".`);
    return;
  }
  if (!SUPABASE_URL) throw new Error('src/community-config.js has no SUPABASE_URL');
  if (publicFromPrivate(privateKey) !== VAPID_PUBLIC_KEY) {
    console.log('::error title=VAPID key mismatch::VAPID_PRIVATE_KEY does not belong to the public key in src/push-config.js.');
    process.exit(1);
  }
  webpush.setVapidDetails(PUSH_SUBJECT, VAPID_PUBLIC_KEY, privateKey);
  const q = db(secret);

  const subs = await q('push_subscriptions?select=device_id,subscription,hour,time_zone,lang,themes,sources,last_sent');
  const due = subs
    .map((s) => ({ ...s, ...localNow(s.time_zone) }))
    .filter((s) => force || (s.nowHour >= s.hour && s.last_sent !== s.day));
  console.log(`${subs.length} subscription(s), ${due.length} due now${force ? ' (forced)' : ''}.`);
  if (!due.length) return;

  let global = null;
  try { global = await fetchScores(); } catch (err) { console.warn(`Community scores unavailable: ${err.message}`); }
  const translations = new Map();

  let sent = 0;
  let failed = 0;
  for (const s of due) {
    const id = s.device_id.slice(0, 8);
    try {
      const buckets = await poolFor(s);
      if (!buckets.length) {
        console.log(`${id}: no themes or authors with quotes — skipped`);
        continue;
      }
      const rng = mulberry32(parseInt(hash(`${s.day}|${s.device_id}|push`), 16));
      const quote = pickPersonal(buckets, null, rng, { global });
      const who = SOURCES.find((x) => x.id === quote.sourceId)?.name || quote.source;
      let translation = '';
      if (s.lang) {
        const key = `${s.lang}:${quote.id}`;
        if (!translations.has(key)) {
          try { translations.set(key, await translate(quote.text, s.lang)); } catch { translations.set(key, ''); }
        }
        translation = translations.get(key);
      }
      const payload = { date: s.day, title: 'Thought for today', body: `“${quote.text}” — ${who}`, quote, translation, lang: s.lang || '', url: './' };
      await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 12 * 3600, urgency: 'normal' });
      await q(`push_subscriptions?device_id=eq.${s.device_id}`, { method: 'PATCH', body: { last_sent: s.day } });
      sent++;
      console.log(`${id}: sent (${s.day}, reminder ${s.hour}:00 ${s.time_zone}) — ${who}`);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await q(`push_subscriptions?device_id=eq.${s.device_id}`, { method: 'DELETE' }).catch(() => {});
        console.log(`${id}: subscription expired — removed`);
      } else {
        failed++;
        console.log(`::error title=Push failed::${id}: ${err.statusCode || ''} ${err.body || err.message}`);
      }
    }
  }
  console.log(`Sent ${sent}, failed ${failed}.`);
  if (failed && !sent) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
