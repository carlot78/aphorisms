import { SOURCES, TOPICS, CUSTOM_TOPIC } from './src/sources.js';
import { fetchSource, hash } from './src/wikiquote.js';
import { translate, LANGUAGES, languageName } from './src/translate.js';
import { flagSvg } from './src/flags.js';
import { parseShared, parseClippings, bookmarklet } from './src/collection.js';
import { buildProfile, pickPersonal, globalScore } from './src/taste.js';
import { THEMES, themeById, themesOf } from './src/themes.js';
import { emptyJourney, visit, liveStreak, levelOf, stats, checkBadges, roman, BADGES, XP } from './src/journey.js';
import { communityEnabled, sendVote, fetchScores, toVote, savePush, deletePush } from './src/community.js';
import { pushSupported, isIos, isStandalone, currentSubscription, subscribe, unsubscribe, showLocalNotification, readLatestPush, savePushRenewalInfo } from './src/push.js';
import { VAPID_PUBLIC_KEY } from './src/push-config.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './src/community-config.js';

const FRESH_MS = 7 * 24 * 3600 * 1000; // re-fetch sources and themes weekly
const SNAPSHOT_RETRY_MS = 24 * 3600 * 1000;
const GLOBAL_TTL = 6 * 3600 * 1000; // community scores
const MAX_QUOTES_PER_SOURCE = 400;
const MAX_THEME_QUOTES = 250;
const MAX_SEEN = 3000;
const MAX_HISTORY = 90;
const MAX_TRANSLATIONS = 300;
const CONCURRENCY = 3;
const DISCOVER_RATE = 1 / 7; // a new voice roughly once a week
const THUMB_TTL = 30 * 24 * 3600 * 1000;
const COLLECTION_ID = 'collection';
const APP_URL = new URL('./', location.href).href;

const $ = (id) => document.getElementById(id);
const el = {
  date: $('date'), streakBtn: $('journey-open'), streakN: $('streak-n'), settingsOpen: $('settings-open'),
  seal: $('seal'), card: $('card'), text: $('quote-text'), translation: $('quote-translation'),
  source: $('quote-source'), cite: $('quote-cite'), community: $('community'),
  discover: $('discover'), discoverText: $('discover-text'), discoverAdd: $('discover-add'),
  faces: $('faces'), rateLabel: $('rate-label'),
  empty: $('empty'), emptyMsg: $('empty-msg'), actions: $('actions'), another: $('another'), fav: $('fav'), share: $('share'),
  favList: $('fav-list'), historyList: $('history-list'), status: $('status'), toast: $('toast'),
  welcome: $('welcome'), welcomeThemes: $('welcome-themes'), welcomeGo: $('welcome-go'),
  settings: $('settings'), themeGrid: $('theme-grid'), groups: $('source-groups'), followCount: $('follow-count'), authorsSection: $('authors-section'),
  flagGrid: $('flag-grid'), langCurrent: $('lang-current'),
  pushCurrent: $('push-current'), pushUnsupported: $('push-unsupported'), pushControls: $('push-controls'), pushHour: $('push-hour'),
  pushEnable: $('push-enable'), pushTest: $('push-test'), pushDisable: $('push-disable'), pushStatus: $('push-status'),
  colCount: $('col-count'), colAdd: $('col-add'), colFile: $('col-file'), colStatus: $('col-status'), colList: $('col-list'), colBookmarklet: $('col-bookmarklet'),
  communityNote: $('community-note'), resetAll: $('reset-all'),
  journey: $('journey'), levelName: $('level-name'), levelBar: $('level-bar'), levelNext: $('level-next'), stats: $('stats'), calendar: $('calendar'), badges: $('badges'),
  shareDialog: $('share-dialog'), shareText: $('share-text'), shareFrom: $('share-from'), shareUrl: $('share-url'), shareHint: $('share-hint'), sharePaste: $('share-paste'),
};

// ---------- storage ----------

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('aph.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('aph.' + key, JSON.stringify(value));
    } catch (err) {
      setStatus('Storage is full — try fewer themes or authors.');
      console.warn(err);
    }
  },
  remove(key) {
    try { localStorage.removeItem('aph.' + key); } catch { /* ignore */ }
  },
  keys() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('aph.')) out.push(k.slice(4));
    }
    return out;
  },
};

// Settings: themes + followed authors (+ own passages) make the pool. Older
// versions had modes and switches; they are folded into this one model.
const firstRun = !store.get('settings', null);
const settings = store.get('settings', null) || { enabled: [], customs: [], salt: Math.random().toString(36).slice(2) };
settings.enabled ||= [];
settings.customs ||= [];
settings.themes ||= [];
settings.lang ||= '';
settings.pushHour ??= 8;
for (const old of ['mode', 'taste', 'discover']) delete settings[old];
const saveSettings = () => store.set('settings', settings);

const allSources = () => [...SOURCES, ...settings.customs];
const findSource = (id) => allSources().find((s) => s.id === id);
const nameOf = (q) => findSource(q.sourceId)?.name || q.source;

// ---------- dates & randomness ----------

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(quotes, max) {
  if (quotes.length <= max) return quotes;
  const step = quotes.length / max;
  return Array.from({ length: max }, (_, i) => quotes[Math.floor(i * step)]);
}

// ---------- sources (followed authors) ----------

const sourceCache = new Map();

function loadCached(id) {
  if (!sourceCache.has(id)) {
    const data = store.get('src.' + id, null);
    if (data) sourceCache.set(id, data);
  }
  return sourceCache.get(id) || null;
}

function storeSource(id, page, origin) {
  const data = {
    id, title: page.title, url: page.url, fetchedAt: Date.now(), origin,
    quotes: sample(page.quotes, MAX_QUOTES_PER_SOURCE).map((q) => ({ ...q, sourceId: id })),
  };
  sourceCache.set(id, data);
  store.set('src.' + id, data);
  return data;
}

async function fetchSnapshot(id) {
  const res = await fetch(`data/sources/${encodeURIComponent(id)}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`no snapshot (${res.status})`);
  return res.json();
}

/** Live Wikiquote first, the weekly snapshot as fallback. */
async function refreshSource(src) {
  try {
    const page = await fetchSource(src.title);
    if (!page.quotes.length) throw new Error('no quotes parsed');
    return storeSource(src.id, page, 'live');
  } catch (liveErr) {
    if (src.custom) throw liveErr;
    return storeSource(src.id, await fetchSnapshot(src.id), 'snapshot');
  }
}

async function ensureSources({ onLoaded } = {}) {
  const queue = settings.enabled.map(findSource).filter(Boolean).filter((src) => {
    const c = loadCached(src.id);
    const age = c ? Date.now() - c.fetchedAt : Infinity;
    return !c || age > (c.origin === 'snapshot' ? SNAPSHOT_RETRY_MS : FRESH_MS);
  });
  const worker = async () => {
    while (queue.length) {
      const src = queue.shift();
      try {
        await refreshSource(src);
        onLoaded?.(src);
      } catch (err) {
        console.warn(err);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

// ---------- themes ----------

const loadThemeCached = (id) => store.get('theme.' + id, null);

async function ensureThemes() {
  for (const id of settings.themes) {
    const c = loadThemeCached(id);
    if (c && Date.now() - c.fetchedAt < FRESH_MS) continue;
    try {
      const res = await fetch(`data/themes/${encodeURIComponent(id)}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      store.set('theme.' + id, { fetchedAt: Date.now(), quotes: sample(data.quotes, MAX_THEME_QUOTES) });
    } catch (err) {
      console.warn(`Theme ${id}:`, err.message);
    }
  }
}

const matchesChosenThemes = (text) => themesOf(text).some((t) => settings.themes.includes(t));

// ---------- own passages ("My collection") ----------

const loadCollection = () => store.get('collection', []);

function collectionQuote({ text, attribution, url }) {
  return {
    id: hash('col|' + text.toLowerCase().replace(/\s+/g, ' ')),
    text, source: attribution || 'Your passages', section: '', cite: attribution ? 'Your passages' : '',
    url: url || '', sourceId: COLLECTION_ID, added: Date.now(),
  };
}

function addToCollection(entries) {
  const items = loadCollection();
  const ids = new Set(items.map((q) => q.id));
  let added = 0;
  for (const e of entries) {
    const text = (e.text || '').trim();
    if (text.length < 3) continue;
    const q = collectionQuote({ ...e, text });
    if (ids.has(q.id)) continue;
    ids.add(q.id);
    items.unshift(q);
    added++;
  }
  store.set('collection', items);
  if (added) reward(XP.passage * added, (j) => { j.passages += added; });
  return added;
}

// ---------- the daily pick ----------

let current = null;

function pool() {
  const buckets = [];
  for (const id of settings.themes) {
    const t = loadThemeCached(id);
    if (t?.quotes?.length) buckets.push(t.quotes);
  }
  for (const id of settings.enabled) {
    const c = loadCached(id);
    if (c?.quotes?.length) buckets.push(c.quotes);
  }
  const col = loadCollection();
  if (col.length) buckets.push(col);
  return buckets;
}

let profileCache = null;
const loadRatings = () => store.get('ratings', {});
const tasteProfile = () => (profileCache ||= buildProfile(loadRatings()));
const globalScores = () => store.get('global', null)?.data || null;

function pickQuote(rng) {
  const buckets = pool();
  if (!buckets.length) return null;
  const seen = new Set(store.get('seen', []));
  let unseen = buckets.map((b) => b.filter((q) => !seen.has(q.id))).filter((b) => b.length);
  if (!unseen.length) {
    store.set('seen', []);
    unseen = buckets;
  }
  const opts = { global: globalScores() };
  const discovery = store.get('discover', null);
  if (discovery && rng() < DISCOVER_RATE) {
    return { ...pickPersonal([discovery.quotes], tasteProfile(), rng, opts), discover: true };
  }
  return pickPersonal(unseen, tasteProfile(), rng, opts);
}

/** Can `q` stay as today's thought after the selection changed? */
function stillEligible(q) {
  if (!q) return false;
  if (q.discover) return true;
  if (q.sourceId === COLLECTION_ID) return loadCollection().some((x) => x.id === q.id);
  return settings.enabled.includes(q.sourceId) || matchesChosenThemes(q.text);
}

function markSeen(quote) {
  const seen = store.get('seen', []);
  if (!seen.includes(quote.id)) {
    seen.push(quote.id);
    if (seen.length > MAX_SEEN) seen.splice(0, seen.length - MAX_SEEN);
    store.set('seen', seen);
  }
}

function recordHistory(date, quote) {
  const history = store.get('history', []).filter((h) => h.date !== date);
  history.unshift({ date, quote });
  store.set('history', history.slice(0, MAX_HISTORY));
}

/** Make `quote` today's thought (bookkeeping + journey). */
function adopt(quote, date = todayKey()) {
  current = quote;
  markSeen(quote);
  store.set('today', { date, quote });
  recordHistory(date, quote);
  const fresh = meet(quote.sourceId);
  const themes = themesOf(quote.text);
  reward(fresh ? XP.newVoice : 0, (j) => { j.themesRead = [...new Set([...j.themesRead, ...themes])]; });
  if (fresh && quote.discover) toast(`A new voice: ${nameOf(quote)} · +${XP.newVoice}`);
  if (quote.discover) {
    store.remove('discover');
    prepareDiscovery();
  }
}

function showToday({ replace = false } = {}) {
  const date = todayKey();
  const today = store.get('today', null);
  if (!replace && today?.date === date && today.quote) {
    current = today.quote;
  } else {
    const quote = pickQuote(mulberry32(parseInt(hash(date + settings.salt + (replace ? Date.now() : '')), 16)));
    if (!quote) {
      current = null;
      renderQuote();
      return;
    }
    adopt(quote, date);
  }
  renderQuote();
  renderLists();
}

// ---------- discovering new authors ----------

function metSources() {
  let met = store.get('met', null);
  if (!met) {
    met = [...new Set(store.get('history', []).map((h) => h.quote.sourceId))];
    store.set('met', met);
  }
  return met;
}

/** Note an author as met; true the first time. */
function meet(sourceId) {
  if (!sourceId || sourceId === COLLECTION_ID) return false;
  const met = metSources();
  if (met.includes(sourceId)) return false;
  store.set('met', [...met, sourceId]);
  return true;
}

async function prepareDiscovery() {
  if (store.get('discover', null)) return;
  const met = new Set(metSources());
  const candidates = SOURCES.filter((s) => !settings.enabled.includes(s.id) && !met.has(s.id));
  if (!candidates.length) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  try {
    const data = await fetchSnapshot(pick.id);
    const quotes = sample(data.quotes, 60).map((q) => ({ ...q, sourceId: pick.id }));
    if (quotes.length) store.set('discover', { id: pick.id, quotes });
  } catch (err) {
    console.warn('Discovery prefetch failed:', err.message);
  }
}

// ---------- community (shared ratings) ----------

function deviceId() {
  let id = store.get('device', null);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
    store.set('device', id);
  }
  return id;
}

/** Queue a vote; sent now if online, retried on the next open otherwise. */
function queueVote(quote, r) {
  if (!communityEnabled() || quote.sourceId === COLLECTION_ID) return;
  const out = store.get('votesOut', {});
  out[quote.id] = { quoteId: quote.id, sourceId: quote.sourceId, vote: toVote(r) };
  store.set('votesOut', out);
  flushVotes();
}

let flushing = false;
async function flushVotes() {
  if (flushing || !communityEnabled()) return;
  flushing = true;
  try {
    const out = store.get('votesOut', {});
    for (const [id, v] of Object.entries(out)) {
      await sendVote(deviceId(), v);
      const left = store.get('votesOut', {});
      if (left[id]?.vote === v.vote) delete left[id];
      store.set('votesOut', left);
    }
  } catch (err) {
    console.warn('Vote sync paused:', err.message);
  } finally {
    flushing = false;
  }
}

async function refreshGlobal() {
  if (!communityEnabled()) return;
  const cached = store.get('global', null);
  if (cached && Date.now() - cached.at < GLOBAL_TTL) return;
  try {
    store.set('global', { at: Date.now(), data: await fetchScores() });
    if (current) renderCommunity(current);
  } catch (err) {
    console.warn(err.message);
  }
}

function renderCommunity(quote) {
  const entry = globalScores()?.[quote.id];
  const n = entry ? entry[0] + entry[1] + entry[2] : 0;
  el.community.hidden = n < 3;
  if (n < 3) return;
  const pct = Math.round((entry[0] / n) * 100);
  el.community.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = `${pct}%`;
  el.community.append(b, ` of ${n} readers found this spoke to them`);
}

// ---------- journey (streaks, levels, laurels) ----------

const loadJourney = () => ({ ...emptyJourney(), ...store.get('journey', {}) });

/** Apply a change to the journey, award XP, and announce new laurels. */
function reward(xp, mutate) {
  const j = loadJourney();
  const before = levelOf(j.xp).index;
  mutate?.(j);
  j.xp += xp;
  const fresh = checkBadges(j, stats(j, metSources().length), todayKey());
  store.set('journey', j);
  const lvl = levelOf(j.xp);
  if (lvl.index > before) toast(`You are now a ${lvl.name} ✦`);
  for (const b of fresh) toast(`${b.icon} Laurel earned: ${b.name}`);
  renderStreak();
}

function renderStreak() {
  const j = loadJourney();
  const today = todayKey();
  const streak = liveStreak(j, today);
  el.streakN.textContent = String(streak);
  el.streakBtn.dataset.cold = String(j.last !== today);
  el.streakBtn.title = j.last === today ? `${streak}-day streak` : streak ? `Open today's thought to keep your ${streak}-day streak` : 'Start a streak today';
}

const toastQueue = [];
function toast(msg) {
  toastQueue.push(msg);
  if (toastQueue.length === 1) nextToast();
}
function nextToast() {
  if (!toastQueue.length) return;
  el.toast.textContent = toastQueue[0];
  el.toast.hidden = false;
  el.toast.style.animation = 'none';
  void el.toast.offsetWidth;
  el.toast.style.animation = '';
  setTimeout(() => {
    toastQueue.shift();
    el.toast.hidden = true;
    setTimeout(nextToast, 200);
  }, 2600);
}

function renderJourney() {
  const j = loadJourney();
  const today = todayKey();
  const lvl = levelOf(j.xp);
  el.levelName.textContent = lvl.name;
  el.levelBar.style.width = `${Math.round(lvl.progress * 100)}%`;
  el.levelNext.textContent = lvl.next ? `${j.xp} XP · ${lvl.next.xp - j.xp} to ${lvl.next.name}` : `${j.xp} XP · the summit`;
  const voices = metSources().length;
  const tiles = [
    [liveStreak(j, today), 'day streak'],
    [j.best, 'best streak'],
    [`${voices}/${SOURCES.length}`, 'voices met'],
    [j.days.length, 'days read'],
  ];
  el.stats.replaceChildren(...tiles.map(([v, label]) => {
    const d = document.createElement('div');
    d.className = 'stat';
    const b = document.createElement('b');
    b.textContent = v;
    const s = document.createElement('span');
    s.textContent = label;
    d.append(b, s);
    return d;
  }));
  const days = new Set(j.days);
  const cells = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const c = document.createElement('i');
    c.dataset.on = String(days.has(key));
    c.dataset.today = String(i === 0);
    c.title = d.toLocaleDateString();
    cells.push(c);
  }
  el.calendar.replaceChildren(...cells);
  el.badges.replaceChildren(...BADGES.map((b) => {
    const d = document.createElement('div');
    d.className = 'badge';
    d.dataset.locked = String(!j.badges[b.id]);
    d.innerHTML = '<span class="b-icon"></span><span class="b-name"></span><span class="b-desc"></span>';
    d.querySelector('.b-icon').textContent = b.icon;
    d.querySelector('.b-name').textContent = b.name;
    d.querySelector('.b-desc').textContent = j.badges[b.id] ? `${b.desc} · ${j.badges[b.id]}` : b.desc;
    return d;
  }));
}

// ---------- the seal: a small daily ritual ----------

const visitedToday = () => loadJourney().last === todayKey();

function renderStage() {
  const sealed = !visitedToday() && !el.welcome.open;
  el.seal.hidden = !sealed;
  if (sealed) {
    el.card.hidden = el.actions.hidden = el.empty.hidden = true;
    return;
  }
  renderQuote();
}

function breakSeal() {
  el.seal.classList.add('breaking');
  setTimeout(() => {
    el.seal.classList.remove('breaking');
    let res = {};
    reward(0, (j) => { res = visit(j, todayKey()); }); // visit() adds the day's XP itself
    const { gained, broken } = res;
    const streak = liveStreak(loadJourney(), todayKey());
    if (gained) toast(broken || streak === 1 ? `Day 1 of a new streak · +${gained} XP` : `Day ${streak} in a row · +${gained} XP`);
    el.streakBtn.classList.add('bump');
    setTimeout(() => el.streakBtn.classList.remove('bump'), 700);
    renderStage();
  }, 500);
}

// ---------- rendering the card ----------

function setStatus(msg) {
  el.status.textContent = msg;
}

function renderQuote() {
  if (el.seal && !el.seal.hidden) return;
  const quote = current;
  if (!quote) {
    el.card.hidden = el.actions.hidden = true;
    el.empty.hidden = false;
    el.emptyMsg.textContent = settings.themes.length || settings.enabled.length || loadCollection().length
      ? 'Gathering wisdom…'
      : 'Choose a theme in the menu to begin.';
    return;
  }
  el.empty.hidden = true;
  el.card.hidden = el.actions.hidden = false;
  el.card.style.animation = 'none';
  void el.card.offsetWidth;
  el.card.style.animation = '';

  el.text.textContent = quote.text;
  el.text.classList.toggle('long', quote.text.length > 260);
  el.source.textContent = nameOf(quote);
  const href = quote.url || loadCached(quote.sourceId)?.url || (findSource(quote.sourceId) ? `https://en.wikiquote.org/wiki/${encodeURIComponent(findSource(quote.sourceId).title.replace(/ /g, '_'))}` : '');
  if (href) el.source.href = href;
  else el.source.removeAttribute('href');
  el.cite.textContent = [quote.section, quote.cite].filter(Boolean).join(' · ');
  renderFaces();
  renderFav();
  renderDiscover();
  renderCommunity(quote);
  renderTranslation(quote);
}

// Three faces, stored on the 1–5 scale the taste profile uses: 🙁 1, 😐 3, 🙂 5.
const FACES = [
  { r: 1, label: 'Not for me', mouth: 'M8 16.5q4-3.5 8 0', emoji: '🙁' },
  { r: 3, label: "It's okay", mouth: 'M8.5 15.5h7', emoji: '😐' },
  { r: 5, label: 'This spoke to me', mouth: 'M8 14q4 4 8 0', emoji: '🙂' },
];
const faceOf = (r) => (!r ? null : r <= 2 ? FACES[0] : r === 3 ? FACES[1] : FACES[2]);
const ratingOf = (q) => (q ? loadRatings()[q.id]?.r || 0 : 0);

function setRating(quote, r) {
  const ratings = loadRatings();
  const first = !ratings[quote.id];
  if (!r) delete ratings[quote.id];
  else ratings[quote.id] = { r, sourceId: quote.sourceId, text: quote.text, at: Date.now() };
  store.set('ratings', ratings);
  profileCache = null;
  if (r && first) reward(XP.vote, (j) => { j.votes++; });
  queueVote(quote, r);
}

function renderFaces() {
  const chosen = faceOf(ratingOf(current));
  el.faces.replaceChildren(...FACES.map((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'face';
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle class="eye" cx="9" cy="10" r="1.1"/><circle class="eye" cx="15" cy="10" r="1.1"/><path d="${f.mouth}"/></svg>`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(f === chosen));
    b.setAttribute('aria-label', f.label);
    b.title = f.label;
    b.addEventListener('click', () => {
      if (!current) return;
      setRating(current, f === faceOf(ratingOf(current)) ? 0 : f.r);
      renderFaces();
      el.faces.children[FACES.indexOf(f)]?.classList.add('pop');
      renderLists();
    });
    return b;
  }));
  el.rateLabel.textContent = chosen ? chosen.label : 'Did this speak to you?';
}

const isFav = (q) => store.get('favs', []).some((f) => f.id === q.id);

function renderFav() {
  const on = current && isFav(current);
  el.fav.setAttribute('aria-pressed', String(!!on));
  el.fav.textContent = on ? '♥ Saved' : '♡ Save';
}

function renderDiscover() {
  const src = current?.discover ? findSource(current.sourceId) : null;
  el.discover.hidden = !src;
  if (!src) return;
  const followed = settings.enabled.includes(src.id);
  el.discoverText.textContent = followed ? `You now follow ${src.name}.` : `A new voice for you: ${src.name} — ${src.blurb}.`;
  el.discoverAdd.hidden = followed;
}

// ---------- translation ----------

let translationSeq = 0;
const cachedTranslation = (q, lang) => store.get('tr', {})[`${lang}:${q.id}`] || '';

function rememberTranslation(q, lang, text) {
  const cache = store.get('tr', {});
  cache[`${lang}:${q.id}`] = text;
  const keys = Object.keys(cache);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TRANSLATIONS))) delete cache[k];
  store.set('tr', cache);
}

async function renderTranslation(quote) {
  const lang = settings.lang;
  const seq = ++translationSeq;
  el.translation.hidden = !lang;
  if (!lang) return;
  el.translation.setAttribute('lang', lang);
  const shown = (text) => {
    el.translation.textContent = text;
    el.translation.classList.remove('pending');
    if (!loadJourney().translated) reward(0, (j) => { j.translated = 1; });
  };
  const hit = cachedTranslation(quote, lang);
  if (hit) return shown(hit);
  el.translation.textContent = '…';
  el.translation.classList.add('pending');
  try {
    const text = await translate(quote.text, lang);
    if (seq !== translationSeq) return;
    rememberTranslation(quote, lang, text);
    shown(text);
  } catch {
    if (seq !== translationSeq) return;
    el.translation.textContent = `(translation into ${languageName(lang)} unavailable right now)`;
    el.translation.classList.remove('pending');
  }
}

// ---------- library ----------

function quoteItem(q, meta, onRemove) {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.className = 'q';
  span.textContent = q.text;
  const m = document.createElement('span');
  m.className = 'meta';
  m.textContent = meta;
  span.append(m);
  li.append(span);
  if (onRemove) {
    const x = document.createElement('button');
    x.className = 'x';
    x.type = 'button';
    x.textContent = '✕';
    x.title = 'Remove';
    x.addEventListener('click', onRemove);
    li.append(x);
  }
  return li;
}

function renderLists() {
  el.favList.replaceChildren(...store.get('favs', []).map((q) =>
    quoteItem(q, nameOf(q), () => {
      store.set('favs', store.get('favs', []).filter((f) => f.id !== q.id));
      renderLists();
      renderFav();
    })
  ));
  const history = store.get('history', []).filter((h) => h.date !== todayKey());
  el.historyList.replaceChildren(...history.map((h) => {
    const f = faceOf(ratingOf(h.quote));
    return quoteItem(h.quote, `${h.date} · ${nameOf(h.quote)}${f ? ` · ${f.emoji}` : ''}`);
  }));
}

// ---------- settings: themes ----------

function themeCard(t, onToggle) {
  const on = settings.themes.includes(t.id);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'theme';
  b.setAttribute('aria-pressed', String(on));
  b.title = t.blurb;
  b.innerHTML = '<span class="icon" aria-hidden="true"></span><span class="name"></span>';
  b.querySelector('.icon').textContent = t.icon;
  b.querySelector('.name').textContent = t.name;
  b.addEventListener('click', () => {
    settings.themes = on ? settings.themes.filter((x) => x !== t.id) : [...settings.themes, t.id];
    saveSettings();
    onToggle();
  });
  return b;
}

function renderThemeGrid() {
  el.themeGrid.replaceChildren(...THEMES.map((t) => themeCard(t, renderThemeGrid)));
}

function renderWelcome() {
  el.welcomeThemes.replaceChildren(...THEMES.map((t) => themeCard(t, renderWelcome)));
  el.welcomeGo.disabled = !settings.themes.length;
  el.welcomeGo.textContent = settings.themes.length ? 'Begin' : 'Choose at least one';
}

// ---------- settings: authors ----------

async function ensureThumbs(sources) {
  const thumbs = store.get('thumbs', {});
  const todo = sources.filter((s) => !thumbs[s.id] || Date.now() - thumbs[s.id].at > THUMB_TTL);
  if (!todo.length) return false;
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const params = new URLSearchParams({
      action: 'query', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '96', redirects: '1',
      format: 'json', formatversion: '2', origin: '*', titles: batch.map((s) => s.title).join('|'),
    });
    try {
      const q = (await (await fetch(`https://en.wikipedia.org/w/api.php?${params}`)).json()).query || {};
      const alias = new Map([...(q.normalized || []), ...(q.redirects || [])].map((r) => [r.from, r.to]));
      const resolve = (t) => { for (let n = 0; n < 5 && alias.has(t); n++) t = alias.get(t); return t; };
      const byTitle = new Map((q.pages || []).map((p) => [p.title, p]));
      for (const s of batch) thumbs[s.id] = { url: byTitle.get(resolve(s.title))?.thumbnail?.source || '', at: Date.now() };
    } catch {
      return false;
    }
  }
  store.set('thumbs', thumbs);
  return true;
}

const initials = (name) => name.split(/\s+/).filter((w) => /^[A-Za-zÀ-ž]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

function avatarEl(src, thumbs) {
  const wrap = document.createElement('span');
  wrap.className = 'avatar';
  const url = thumbs[src.id]?.url;
  if (url) {
    const img = document.createElement('img');
    Object.assign(img, { src: url, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.remove(); wrap.textContent = initials(src.name); });
    wrap.append(img);
  } else {
    wrap.textContent = initials(src.name);
  }
  return wrap;
}

function setFollowed(id, on) {
  const has = settings.enabled.includes(id);
  if (on && !has) settings.enabled.push(id);
  if (!on && has) settings.enabled = settings.enabled.filter((x) => x !== id);
  saveSettings();
  renderFollowCount();
}

function renderFollowCount() {
  const n = settings.enabled.length;
  el.followCount.textContent = n ? `${n} followed` : 'none';
}

function renderAuthors() {
  const thumbs = store.get('thumbs', {});
  const topics = [...TOPICS, ...(settings.customs.length ? [CUSTOM_TOPIC] : [])];
  el.groups.replaceChildren(...topics.map((topic) => {
    const items = allSources().filter((s) => s.group === topic.name);
    const wrap = document.createElement('div');
    wrap.className = 'group';
    const h = document.createElement('h4');
    h.textContent = `${topic.icon} ${topic.name}`;
    const tools = document.createElement('span');
    tools.className = 'group-tools';
    for (const [label, on] of [['all', true], ['none', false]]) {
      const a = document.createElement('a');
      a.textContent = label;
      a.addEventListener('click', () => { for (const s of items) setFollowed(s.id, on); renderAuthors(); });
      tools.append(a);
    }
    h.append(tools);
    const grid = document.createElement('div');
    grid.className = 'people';
    for (const s of items) {
      const label = document.createElement('label');
      label.className = 'person';
      label.title = s.blurb || '';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings.enabled.includes(s.id);
      input.addEventListener('change', () => setFollowed(s.id, input.checked));
      const text = document.createElement('span');
      text.className = 'text';
      text.innerHTML = '<span class="name"></span><span class="blurb"></span>';
      text.querySelector('.name').textContent = s.name;
      text.querySelector('.blurb').textContent = s.blurb || '';
      label.append(input, avatarEl(s, thumbs), text);
      grid.append(label);
    }
    wrap.append(h, grid);
    return wrap;
  }));
  renderFollowCount();
}

// ---------- settings: translation ----------

function renderLanguages() {
  const options = LANGUAGES.map((code) => ({ code, native: languageName(code, code) })).sort((a, b) => a.native.localeCompare(b.native));
  const card = ({ code, native }, art) => {
    const label = document.createElement('label');
    label.className = 'flag';
    const input = document.createElement('input');
    Object.assign(input, { type: 'radio', name: 'lang', value: code, checked: settings.lang === code });
    input.addEventListener('change', () => {
      settings.lang = code;
      saveSettings();
      el.langCurrent.textContent = code ? languageName(code) : 'off';
      if (current) renderTranslation(current);
    });
    const a = document.createElement('span');
    a.className = 'art';
    a.innerHTML = art; // trusted: our own SVG module
    const n = document.createElement('span');
    n.className = 'native';
    n.textContent = native;
    label.append(input, a, n);
    return label;
  };
  el.flagGrid.replaceChildren(
    card({ code: '', native: 'None' }, '<span class="none" aria-hidden="true">—</span>'),
    ...options.map((o) => card(o, flagSvg(o.code)))
  );
  el.langCurrent.textContent = settings.lang ? languageName(settings.lang) : 'off';
}

// ---------- settings: daily reminder (Web Push) ----------

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

async function renderReminder() {
  const supported = pushSupported() && location.protocol !== 'file:' && communityEnabled();
  el.pushUnsupported.hidden = supported;
  el.pushControls.hidden = !supported;
  if (!supported) {
    el.pushUnsupported.textContent = !communityEnabled()
      ? 'Reminders need the shared database, which is not configured.'
      : isIos() && !isStandalone()
        ? 'On iPhone and iPad, reminders work once the app is on your Home Screen: Share → "Add to Home Screen".'
        : 'This browser does not support notifications.';
    el.pushCurrent.textContent = '';
    return;
  }
  if (!el.pushHour.options.length) for (let h = 0; h < 24; h++) el.pushHour.append(new Option(hh(h), h));
  el.pushHour.value = settings.pushHour;
  let sub = null;
  let swError = '';
  try { sub = await currentSubscription(); } catch (err) { swError = err.message; }
  const blocked = Notification.permission !== 'granted';
  // Subscribed but notifications were blocked on the phone (by hand, or by
  // Android's automatic clean-up of permissions for rarely used sites).
  el.pushEnable.hidden = !!sub && !blocked;
  el.pushEnable.textContent = sub && blocked ? 'Turn back on' : 'Turn on';
  el.pushTest.hidden = el.pushDisable.hidden = !sub;
  el.pushCurrent.textContent = sub ? hh(settings.pushHour) : 'off';
  if (sub) {
    const sync = store.get('pushSync', null);
    el.pushStatus.textContent = blocked
      ? 'Notifications are switched off for this app on your phone, so no reminder can arrive. Tap "Turn back on", or allow notifications for Aphorisms in the phone settings.'
      : sync?.error
        ? `On, but not registered yet (${sync.error}) — it will retry.`
        : `On — one thought a day from ${hh(settings.pushHour)} (${timeZone()}).`;
  } else {
    el.pushStatus.textContent = swError ? `Not available here: ${swError}` : Notification.permission === 'denied' ? 'Notifications are blocked for this site.' : '';
  }
}

/**
 * Register (or refresh) this device's reminder in the shared database, with
 * the current hour, time zone, language, themes and authors. Called when the
 * reminder is turned on, when settings change, and on each launch (cheap,
 * keeps a rotated subscription endpoint current).
 */
async function syncPush() {
  if (!communityEnabled() || !pushSupported()) return;
  let sub = null;
  try { sub = await currentSubscription(); } catch { return; }
  if (!sub || Notification.permission !== 'granted') return;
  const prefs = { hour: settings.pushHour, timeZone: timeZone(), lang: settings.lang, themes: settings.themes, sources: settings.enabled };
  const fingerprint = JSON.stringify([sub.endpoint, prefs]);
  const last = store.get('pushSync', null);
  // Re-confirm at least daily: the server drops subscriptions the push service
  // reports as gone, and a confirmation is a cheap upsert.
  if (last?.fingerprint === fingerprint && !last.error && Date.now() - last.at < 20 * 3600 * 1000) return;
  try {
    await savePush(deviceId(), sub, prefs);
    store.set('pushSync', { fingerprint, at: Date.now() });
    // Let the service worker re-register on its own if the browser rotates
    // the subscription while the app is closed (sw.js, pushsubscriptionchange).
    await savePushRenewalInfo({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY, vapid: VAPID_PUBLIC_KEY, device: deviceId(), ...prefs });
  } catch (err) {
    store.set('pushSync', { fingerprint: '', at: Date.now(), error: err.message.slice(0, 80) });
    console.warn(err.message);
  }
}

async function adoptPushedQuote() {
  const p = await readLatestPush();
  const date = todayKey();
  if (!p?.quote || p.date !== date || store.get('pushAdopted', '') === date) return false;
  store.set('pushAdopted', date);
  const quote = { ...p.quote };
  if (p.translation && p.lang) rememberTranslation(quote, p.lang, p.translation);
  adopt(quote, date);
  renderQuote();
  renderLists();
  return true;
}

// ---------- settings: own passages ----------

function renderPassages() {
  const items = loadCollection();
  el.colCount.textContent = items.length ? String(items.length) : '';
  el.colList.replaceChildren(...items.map((q) =>
    quoteItem(q, q.source, () => {
      store.set('collection', loadCollection().filter((x) => x.id !== q.id));
      renderPassages();
    })
  ));
  el.colBookmarklet.href = bookmarklet(APP_URL);
}

const SHARE_HINTS = {
  selection: '',
  fragment: 'Taken from the highlight in the shared link.',
  partial: 'The link only holds the start and end of your selection — paste the full text to replace the “…”.',
  page: 'Only the page link was shared. In Chrome, select the text and tap Share in the pop-up next to it — or copy it and tap Paste.',
};

function openShareDialog(shared = {}) {
  const p = parseShared(shared);
  el.shareText.value = p.text;
  el.shareFrom.value = p.attribution;
  el.shareUrl.value = p.url;
  el.shareHint.textContent = SHARE_HINTS[p.kind] || '';
  el.shareDialog.returnValue = '';
  el.shareDialog.showModal();
  el.shareText.focus();
}

function consumeShareParams() {
  const params = new URLSearchParams(location.search);
  if (!params.has('share') && !params.has('text')) return;
  history.replaceState(null, '', location.pathname);
  openShareDialog({ title: params.get('title') || '', text: params.get('text') || '', url: params.get('url') || '' });
}

// ---------- dialogs ----------

async function openSettings() {
  renderThemeGrid();
  renderFollowCount();
  renderLanguages();
  renderReminder();
  renderPassages();
  el.communityNote.textContent = communityEnabled()
    ? 'Your ratings are shared anonymously with every reader, and theirs help choose your thoughts.'
    : '';
  el.settings.showModal();
}

async function applySelection() {
  await Promise.all([ensureThemes(), ensureSources({ onLoaded: () => { if (!current) showToday(); } })]);
  if (!stillEligible(current)) showToday({ replace: true });
  prepareDiscovery();
  syncPush(); // keep the reminder's themes, language and hour current
}

function bind() {
  el.seal.addEventListener('click', breakSeal);
  el.settingsOpen.addEventListener('click', openSettings);
  el.streakBtn.addEventListener('click', () => { renderJourney(); el.journey.showModal(); });
  el.another.addEventListener('click', () => showToday({ replace: true }));

  el.fav.addEventListener('click', () => {
    if (!current) return;
    const favs = store.get('favs', []);
    const adding = !isFav(current);
    store.set('favs', adding ? [current, ...favs] : favs.filter((f) => f.id !== current.id));
    if (adding) reward(XP.save, (j) => { j.saves++; });
    renderFav();
    renderLists();
  });

  el.share.addEventListener('click', async () => {
    if (!current) return;
    const tr = settings.lang ? cachedTranslation(current, settings.lang) : '';
    const text = `“${current.text}”\n— ${nameOf(current)}` + (tr ? `\n\n${tr}` : '');
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied — ready to paste');
      }
    } catch { /* share sheet dismissed */ }
  });

  el.discoverAdd.addEventListener('click', async () => {
    if (!current?.discover) return;
    setFollowed(current.sourceId, true);
    renderDiscover();
    toast(`You now follow ${nameOf(current)}`);
    await ensureSources();
  });

  // Welcome: first launch.
  el.welcome.addEventListener('close', async () => {
    renderStage();
    await applySelection();
  });

  el.settings.addEventListener('close', applySelection);
  el.authorsSection.addEventListener('toggle', async () => {
    if (!el.authorsSection.open) return;
    renderAuthors();
    if (await ensureThumbs(allSources())) renderAuthors();
  });

  // Reminder
  el.pushHour.addEventListener('change', async () => { settings.pushHour = Number(el.pushHour.value); saveSettings(); await syncPush(); renderReminder(); });
  el.pushEnable.addEventListener('click', async () => {
    el.pushEnable.disabled = true;
    try {
      await subscribe();
      await syncPush();
      toast('Daily reminder on');
    } catch (err) {
      el.pushStatus.textContent = `Could not turn on: ${err.message}`;
    }
    el.pushEnable.disabled = false;
    renderReminder();
  });
  el.pushDisable.addEventListener('click', async () => {
    try { await unsubscribe(); } catch { /* ignore */ }
    try { await deletePush(deviceId()); } catch (err) { console.warn(err.message); }
    store.remove('pushSync');
    renderReminder();
  });
  el.pushTest.addEventListener('click', async () => {
    try {
      await showLocalNotification('Thought for today', { body: current ? `“${current.text}” — ${nameOf(current)}` : 'Your daily thought.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'daily-thought-test' });
    } catch (err) { el.pushStatus.textContent = err.message; }
  });

  // Own passages
  el.colAdd.addEventListener('click', () => openShareDialog());
  el.sharePaste.addEventListener('click', async () => {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (!clip) throw new Error('empty');
      el.shareText.value = parseShared({ text: clip }).text || clip;
      el.shareHint.textContent = '';
    } catch {
      el.shareHint.textContent = 'Could not read the clipboard — long-press the box and choose Paste.';
    }
  });
  el.shareDialog.addEventListener('close', () => {
    const action = el.shareDialog.returnValue;
    if (action !== 'save' && action !== 'show') return;
    const entry = { text: el.shareText.value.trim(), attribution: el.shareFrom.value.trim(), url: el.shareUrl.value };
    const added = addToCollection([entry]);
    const quote = loadCollection().find((q) => q.id === collectionQuote(entry).id);
    if (action === 'show' && quote) {
      if (!visitedToday()) breakSeal();
      adopt(quote);
      renderQuote();
      renderLists();
    }
    toast(added ? 'Added to your passages' : 'Already in your passages');
    if (el.settings.open) renderPassages();
  });
  el.colFile.addEventListener('change', async () => {
    const file = el.colFile.files[0];
    if (!file) return;
    try {
      const entries = parseClippings(await file.text());
      const added = addToCollection(entries);
      el.colStatus.textContent = entries.length ? `Imported ${added} new highlight${added === 1 ? '' : 's'}.` : 'No highlights found — is this a Kindle "My Clippings.txt"?';
      renderPassages();
    } catch (err) {
      el.colStatus.textContent = `Import failed: ${err.message}`;
    } finally {
      el.colFile.value = '';
    }
  });

  el.resetAll.addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('Start over? This removes your themes, ratings, streak, saved thoughts and passages on this device.')) return;
    for (const k of store.keys()) store.remove(k);
    location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    renderDate();
    renderStreak();
    if (store.get('today', {}).date !== todayKey()) showToday();
    renderStage();
    adoptPushedQuote();
    flushVotes();
    syncPush();
  });
  window.addEventListener('online', flushVotes);
}

function renderDate() {
  const d = new Date();
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  el.date.textContent = `${weekday} · ${roman(d.getDate())} · ${roman(d.getMonth() + 1)} · ${roman(d.getFullYear())}`;
  el.date.title = d.toLocaleDateString(undefined, { dateStyle: 'full' });
}

// ---------- boot ----------

async function init() {
  // One-time migration: "my own lines" became passages.
  if (settings.ownLines) {
    addToCollection(settings.ownLines.split('\n').map((t) => ({ text: t.trim() })).filter((e) => e.text.length > 3));
    delete settings.ownLines;
  }
  saveSettings();

  renderDate();
  renderStreak();
  bind();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  }

  const needsWelcome = firstRun || (!settings.themes.length && !settings.enabled.length && !loadCollection().length);
  if (needsWelcome) {
    renderWelcome();
    el.welcome.showModal();
  }
  showToday();
  renderStage();
  renderLists();
  consumeShareParams();
  await adoptPushedQuote();
  if (!needsWelcome) await applySelection();
  flushVotes();
  refreshGlobal();
  syncPush();
}

init();
