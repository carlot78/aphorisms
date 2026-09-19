import { SOURCES, TOPICS, CUSTOM_TOPIC, STARTER_IDS, customSource } from './src/sources.js';
import { fetchSource, hash } from './src/wikiquote.js';
import { translate, LANGUAGES, languageName } from './src/translate.js';
import { flagSvg } from './src/flags.js';
import { pushSupported, isIos, isStandalone, currentSubscription, subscribe, unsubscribe, buildConfig, showLocalNotification, readLatestPush } from './src/push.js';

const FRESH_MS = 7 * 24 * 3600 * 1000; // re-fetch a source after a week
const SNAPSHOT_RETRY_MS = 24 * 3600 * 1000;
const MAX_QUOTES_PER_SOURCE = 400; // keep localStorage well under its limit
const MAX_SEEN = 3000;
const MAX_HISTORY = 90;
const CONCURRENCY = 3;
const OWN_ID = 'own';

const $ = (id) => document.getElementById(id);
const el = {
  date: $('date'), card: $('card'), text: $('quote-text'), source: $('quote-source'), cite: $('quote-cite'),
  empty: $('empty'), emptyMsg: $('empty-msg'), emptyAction: $('empty-action'), actions: $('actions'),
  another: $('another'), copy: $('copy'), fav: $('fav'), status: $('status'),
  favList: $('fav-list'), historyList: $('history-list'),
  dialog: $('sources-dialog'), openSources: $('open-sources'), groups: $('source-groups'), enabledCount: $('enabled-count'),
  customTitle: $('custom-title'), addCustom: $('add-custom'), customHint: $('custom-hint'), ownLines: $('own-lines'),
  refreshAll: $('refresh-all'), resetSeen: $('reset-seen'), resetAll: $('reset-all'), dataStatus: $('data-status'),
  translation: $('quote-translation'), langHint: $('lang-hint'), flagGrid: $('flag-grid'), topicGrid: $('topic-grid'),
  tabs: [...document.querySelectorAll('.tabs [role=tab]')], panels: [...document.querySelectorAll('.panel[data-panel]')],
  pushUnsupported: $('push-unsupported'), pushControls: $('push-controls'), pushHour: $('push-hour'), pushEnable: $('push-enable'),
  pushTest: $('push-test'), pushDisable: $('push-disable'), pushStatus: $('push-status'), pushSetup: $('push-setup'),
  pushConfig: $('push-config'), pushCopy: $('push-copy'),
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
      setStatus('Storage is full — try enabling fewer sources.');
      console.warn(err);
    }
  },
  remove(key) {
    try { localStorage.removeItem('aph.' + key); } catch { /* ignore */ }
  },
  keys(prefix) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('aph.' + prefix)) out.push(k.slice(4));
    }
    return out;
  },
};

let settings = store.get('settings', null) || {
  enabled: [...STARTER_IDS],
  customs: [],
  ownLines: '',
  salt: Math.random().toString(36).slice(2),
};
settings.lang ||= ''; // translation language, '' = none (added after first release)
settings.pushHour ??= 8; // local hour for the daily push notification
const saveSettings = () => store.set('settings', settings);

/** All selectable sources: catalog + user-added Wikiquote pages. */
const allSources = () => [...SOURCES, ...settings.customs];
const findSource = (id) => (id === OWN_ID ? { id: OWN_ID, name: 'My own lines', title: 'My own lines' } : allSources().find((s) => s.id === id));

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

// ---------- source loading ----------

const sourceCache = new Map(); // id -> { id, title, url, fetchedAt, origin, quotes }

function loadCached(id) {
  if (!sourceCache.has(id)) {
    const data = store.get('src.' + id, null);
    if (data) sourceCache.set(id, data);
  }
  return sourceCache.get(id) || null;
}

function sample(quotes, max) {
  if (quotes.length <= max) return quotes;
  const step = quotes.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(quotes[Math.floor(i * step)]);
  return out;
}

function storeSource(id, page, origin) {
  const data = {
    id,
    title: page.title,
    url: page.url,
    fetchedAt: Date.now(),
    origin,
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

/** Fetch one source: live Wikiquote first, bundled snapshot as fallback. */
async function refreshSource(src) {
  try {
    const page = await fetchSource(src.title);
    if (!page.quotes.length) throw new Error('no quotes parsed');
    return storeSource(src.id, page, 'live');
  } catch (liveErr) {
    console.warn(`Live fetch failed for ${src.title}:`, liveErr.message);
    if (src.custom) throw liveErr;
    const snap = await fetchSnapshot(src.id);
    return storeSource(src.id, snap, 'snapshot');
  }
}

function ownSource() {
  const lines = settings.ownLines.split('\n').map((l) => l.trim()).filter((l) => l.length > 3);
  if (!lines.length) return null;
  return {
    id: OWN_ID,
    title: 'My own lines',
    quotes: lines.map((text) => ({ id: hash('own|' + text), text, source: 'My own lines', section: '', cite: '', sourceId: OWN_ID })),
  };
}

/**
 * Make sure every enabled source has quotes available. Stale or missing
 * sources are fetched in the background; `onLoaded` fires after each one so
 * the UI can show something as soon as anything is available.
 */
async function ensureSources({ force = false, onLoaded } = {}) {
  const wanted = settings.enabled.map(findSource).filter(Boolean);
  const queue = wanted.filter((src) => {
    const c = loadCached(src.id);
    const age = c ? Date.now() - c.fetchedAt : Infinity;
    // Snapshot-backed sources retry the live fetch daily; live ones weekly.
    return force || !c || age > (c.origin === 'snapshot' ? SNAPSHOT_RETRY_MS : FRESH_MS);
  });
  if (!queue.length) return { failed: [] };

  const failed = [];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const src = queue.shift();
      const hadCache = !!loadCached(src.id);
      setStatus(`Fetching ${src.name}… (${done + 1}/${done + queue.length + 1})`);
      try {
        await refreshSource(src);
        onLoaded?.(src);
      } catch (err) {
        if (!hadCache) failed.push(src);
        console.warn(err);
      }
      done++;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  setStatus(failed.length ? `Couldn't load: ${failed.map((s) => s.name).join(', ')}` : '');
  renderDataStatus();
  return { failed };
}

// ---------- picking ----------

function pool() {
  const buckets = [];
  for (const id of settings.enabled) {
    const c = loadCached(id);
    if (c?.quotes?.length) buckets.push(c.quotes);
  }
  const own = ownSource();
  if (own) buckets.push(own.quotes);
  return buckets;
}

function pickQuote(rng) {
  let buckets = pool();
  if (!buckets.length) return null;
  const seen = new Set(store.get('seen', []));
  let unseen = buckets.map((b) => b.filter((q) => !seen.has(q.id))).filter((b) => b.length);
  if (!unseen.length) {
    store.set('seen', []); // everything shown once — start over
    unseen = buckets;
  }
  const bucket = unseen[Math.floor(rng() * unseen.length)];
  return bucket[Math.floor(rng() * bucket.length)];
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

let current = null;

function showToday({ replace = false } = {}) {
  const date = todayKey();
  let today = store.get('today', null);
  if (!replace && today?.date === date && today.quote) {
    current = today.quote;
  } else {
    const seedStr = date + settings.salt + (replace ? Date.now() : '');
    const quote = pickQuote(mulberry32(parseInt(hash(seedStr), 16)));
    if (!quote) {
      current = null;
      renderQuote(null);
      return;
    }
    current = quote;
    markSeen(quote);
    store.set('today', { date, quote });
    recordHistory(date, quote);
  }
  renderQuote(current);
  renderLists();
}

// ---------- rendering ----------

function setStatus(msg) {
  el.status.textContent = msg;
}

function renderQuote(quote) {
  if (!quote) {
    el.card.hidden = true;
    el.actions.hidden = true;
    el.empty.hidden = false;
    const hasEnabled = settings.enabled.length || ownSource();
    el.emptyMsg.textContent = hasEnabled ? 'Nothing loaded yet — check your connection or pick other sources.' : 'Pick a few sources to begin.';
    el.emptyAction.hidden = false;
    return;
  }
  el.empty.hidden = true;
  el.card.hidden = false;
  el.actions.hidden = false;
  el.card.style.animation = 'none';
  void el.card.offsetWidth; // restart the entrance animation
  el.card.style.animation = '';

  el.text.textContent = quote.text;
  el.text.classList.toggle('long', quote.text.length > 280);
  const src = findSource(quote.sourceId);
  const cached = quote.sourceId === OWN_ID ? null : loadCached(quote.sourceId);
  el.source.textContent = src?.name || quote.source;
  if (cached?.url) {
    el.source.href = cached.url;
    el.source.removeAttribute('aria-disabled');
  } else {
    el.source.removeAttribute('href');
  }
  el.cite.textContent = [quote.section, quote.cite].filter(Boolean).join(' · ');
  renderFavButton();
  renderTranslation(quote);
}

// ---------- translation ----------

const MAX_TRANSLATIONS = 300;
let translationSeq = 0; // ignore results of a translation that was superseded

function cachedTranslation(quote, lang) {
  return store.get('tr', {})[`${lang}:${quote.id}`] || '';
}

function rememberTranslation(quote, lang, text) {
  const cache = store.get('tr', {});
  cache[`${lang}:${quote.id}`] = text;
  const keys = Object.keys(cache);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TRANSLATIONS))) delete cache[k];
  store.set('tr', cache);
}

/** Show `quote` translated into the chosen language under the English text. */
async function renderTranslation(quote) {
  const lang = settings.lang;
  const seq = ++translationSeq;
  el.translation.hidden = !lang;
  if (!lang) return;
  el.translation.setAttribute('lang', lang);

  const hit = cachedTranslation(quote, lang);
  if (hit) {
    el.translation.textContent = hit;
    el.translation.classList.remove('pending');
    return;
  }
  el.translation.textContent = 'Translating…';
  el.translation.classList.add('pending');
  try {
    const text = await translate(quote.text, lang);
    if (seq !== translationSeq) return;
    rememberTranslation(quote, lang, text);
    el.translation.textContent = text;
  } catch (err) {
    console.warn('Translation failed:', err.message);
    if (seq !== translationSeq) return;
    el.translation.textContent = `Translation into ${languageName(lang)} unavailable right now.`;
  } finally {
    if (seq === translationSeq) el.translation.classList.remove('pending');
  }
}

// ---------- settings UI: topics, sources, translation ----------

const THUMB_TTL = 30 * 24 * 3600 * 1000;
const TABS = ['topics', 'sources', 'translation', 'notifications'];

/**
 * Portrait thumbnails come from Wikipedia's `pageimages` API (the Wikiquote
 * titles match Wikipedia's, redirects included). Cached for a month; a source
 * with no image is cached as '' so we don't ask again.
 */
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
      const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
      const q = (await res.json()).query || {};
      const alias = new Map([...(q.normalized || []), ...(q.redirects || [])].map((r) => [r.from, r.to]));
      const resolve = (t) => { for (let n = 0; n < 5 && alias.has(t); n++) t = alias.get(t); return t; };
      const byTitle = new Map((q.pages || []).map((p) => [p.title, p]));
      for (const s of batch) thumbs[s.id] = { url: byTitle.get(resolve(s.title))?.thumbnail?.source || '', at: Date.now() };
    } catch (err) {
      console.warn('Thumbnail lookup failed:', err.message);
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
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { img.remove(); wrap.textContent = initials(src.name); });
    wrap.append(img);
  } else {
    wrap.textContent = initials(src.name);
  }
  return wrap;
}

const topicsWithCustom = () => [...TOPICS, ...(settings.customs.length ? [CUSTOM_TOPIC] : [])];

function topicState(items) {
  const on = items.filter((s) => settings.enabled.includes(s.id)).length;
  return { on, state: on === 0 ? 'none' : on === items.length ? 'all' : 'some' };
}

function renderTopics() {
  el.topicGrid.replaceChildren(
    ...topicsWithCustom().map((topic) => {
      const items = allSources().filter((s) => s.group === topic.name);
      const { on, state } = topicState(items);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'topic';
      btn.dataset.state = state;
      btn.setAttribute('aria-pressed', state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false');
      btn.title = state === 'all' ? 'Click to deselect all' : 'Click to select all';
      btn.innerHTML = '<span class="icon" aria-hidden="true"></span><span class="body"><span class="name"></span><span class="blurb"></span><span class="meta"></span></span>';
      btn.querySelector('.icon').textContent = topic.icon;
      btn.querySelector('.name').textContent = topic.name;
      btn.querySelector('.blurb').textContent = topic.blurb;
      btn.querySelector('.meta').textContent = `${on} of ${items.length} selected`;
      btn.addEventListener('click', () => {
        const turnOn = state !== 'all';
        for (const s of items) setEnabled(s.id, turnOn);
        renderTopics();
        renderSources();
      });
      return btn;
    })
  );
  renderEnabledCount();
}

function renderSources() {
  const thumbs = store.get('thumbs', {});
  el.groups.replaceChildren(
    ...topicsWithCustom().map((topic) => {
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
        a.addEventListener('click', () => {
          for (const s of items) setEnabled(s.id, on);
          renderSources();
          renderTopics();
        });
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
        input.addEventListener('change', () => {
          setEnabled(s.id, input.checked);
          renderEnabledCount();
          renderTopics();
        });
        const text = document.createElement('span');
        text.className = 'text';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = s.name;
        const blurb = document.createElement('span');
        blurb.className = 'blurb';
        const cached = loadCached(s.id);
        blurb.textContent = [s.blurb, cached ? `${cached.quotes.length} quotes` : ''].filter(Boolean).join(' · ');
        text.append(name, blurb);
        label.append(input, avatarEl(s, thumbs), text);
        if (s.custom) {
          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'rm';
          rm.textContent = '✕';
          rm.title = 'Remove this source';
          rm.addEventListener('click', (e) => {
            e.preventDefault();
            settings.customs = settings.customs.filter((c) => c.id !== s.id);
            setEnabled(s.id, false);
            store.remove('src.' + s.id);
            sourceCache.delete(s.id);
            renderSources();
            renderTopics();
          });
          label.append(rm);
        }
        grid.append(label);
      }
      wrap.append(h, grid);
      return wrap;
    })
  );
  renderEnabledCount();
}

function renderEnabledCount() {
  el.enabledCount.textContent = `${settings.enabled.length} selected`;
}

function renderLanguageGrid() {
  const options = LANGUAGES.map((code) => ({ code, native: languageName(code, code), local: languageName(code) }))
    .sort((a, b) => a.native.localeCompare(b.native));
  const card = ({ code, native, local }, flag) => {
    const label = document.createElement('label');
    label.className = 'flag';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'lang';
    input.value = code;
    input.checked = settings.lang === code;
    input.addEventListener('change', () => {
      settings.lang = code;
      saveSettings();
      renderLangHint();
      if (current) renderTranslation(current);
    });
    const art = document.createElement('span');
    art.className = 'art';
    art.innerHTML = flag; // trusted: our own SVG module
    const text = document.createElement('span');
    text.className = 'text';
    const n = document.createElement('span');
    n.className = 'native';
    n.textContent = native;
    text.append(n);
    if (local && local.toLowerCase() !== native.toLowerCase()) {
      const l = document.createElement('span');
      l.className = 'local';
      l.textContent = local;
      text.append(l);
    }
    label.append(input, art, text);
    return label;
  };
  el.flagGrid.replaceChildren(
    card({ code: '', native: 'English only', local: 'No translation' }, '<span class="none" aria-hidden="true">—</span>'),
    ...options.map((o) => card(o, flagSvg(o.code)))
  );
  renderLangHint();
}

function renderLangHint() {
  el.langHint.textContent = settings.lang
    ? 'Translated automatically (on-device when your browser supports it, otherwise via MyMemory / Google). The English original always stays.'
    : '';
}

function showTab(name) {
  if (!TABS.includes(name)) name = TABS[0];
  for (const tab of el.tabs) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of el.panels) panel.hidden = panel.dataset.panel !== name;
  store.set('ui.tab', name);
}

async function openSettings(tab) {
  renderTopics();
  renderSources();
  renderLanguageGrid();
  renderNotifications();
  renderDataStatus();
  el.ownLines.value = settings.ownLines;
  showTab(tab || store.get('ui.tab', 'topics'));
  el.dialog.showModal();
  // Portraits load in the background; re-render the list once they arrive.
  if ((await ensureThumbs(allSources())) && el.dialog.open) renderSources();
}

// ---------- notifications (Web Push) ----------

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

async function renderNotifications() {
  const supported = pushSupported() && location.protocol !== 'file:';
  el.pushUnsupported.hidden = supported;
  el.pushControls.hidden = !supported;
  if (!supported) {
    el.pushUnsupported.textContent = isIos() && !isStandalone()
      ? 'On iPhone and iPad, notifications only work for installed apps: tap Share → "Add to Home Screen", then open Aphorisms from there.'
      : 'This browser does not support push notifications.';
    return;
  }
  if (!el.pushHour.options.length) {
    for (let h = 0; h < 24; h++) el.pushHour.append(new Option(`${String(h).padStart(2, '0')}:00`, h));
  }
  el.pushHour.value = settings.pushHour;

  let sub = null;
  let swError = '';
  try {
    sub = await currentSubscription();
  } catch (err) {
    swError = err.message;
  }
  const permission = Notification.permission;
  el.pushEnable.hidden = !!sub;
  el.pushTest.hidden = !sub;
  el.pushDisable.hidden = !sub;
  el.pushSetup.hidden = !sub;
  if (sub) {
    el.pushStatus.textContent = permission === 'granted'
      ? `Enabled on this device — one thought a day at ${String(settings.pushHour).padStart(2, '0')}:00 (${timeZone()}).`
      : 'Subscribed, but notifications are blocked in the browser settings for this site.';
    el.pushConfig.value = JSON.stringify(buildConfig({ subscription: sub, sources: settings.enabled, lang: settings.lang, hour: settings.pushHour, timeZone: timeZone() }));
  } else {
    el.pushStatus.textContent = swError
      ? `Cannot enable here: ${swError}`
      : permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in the browser settings, then try again.'
        : 'Not enabled on this device.';
    el.pushConfig.value = '';
  }
}

/**
 * If the service worker received today's push, show that exact quote so the
 * notification and the app agree. Done once per day so "Another" still works.
 */
async function adoptPushedQuote() {
  const p = await readLatestPush();
  const date = todayKey();
  if (!p?.quote || p.date !== date || store.get('pushAdopted', '') === date) return false;
  store.set('pushAdopted', date);
  const quote = { ...p.quote };
  if (p.translation && p.lang) rememberTranslation(quote, p.lang, p.translation);
  current = quote;
  markSeen(quote);
  store.set('today', { date, quote });
  recordHistory(date, quote);
  renderQuote(quote);
  renderLists();
  return true;
}

function bindNotifications() {
  el.pushHour.addEventListener('change', () => {
    settings.pushHour = Number(el.pushHour.value);
    saveSettings();
    renderNotifications();
  });

  el.pushEnable.addEventListener('click', async () => {
    el.pushEnable.disabled = true;
    el.pushStatus.textContent = 'Asking for permission…';
    try {
      await subscribe();
      await renderNotifications();
      showTab('notifications');
    } catch (err) {
      el.pushStatus.textContent = `Could not enable: ${err.message}`;
    } finally {
      el.pushEnable.disabled = false;
    }
  });

  el.pushDisable.addEventListener('click', async () => {
    try {
      await unsubscribe();
    } catch (err) {
      console.warn(err);
    }
    renderNotifications();
  });

  el.pushTest.addEventListener('click', async () => {
    const who = current ? findSource(current.sourceId)?.name || current.source : '';
    try {
      await showLocalNotification('Thought for today', {
        body: current ? `“${current.text}” — ${who}` : 'This is how the daily thought will look.',
        icon: 'icon.svg',
        tag: 'daily-thought-test',
      });
      el.pushStatus.textContent = 'Test notification shown (this one came from the app itself, not from the server).';
    } catch (err) {
      el.pushStatus.textContent = `Could not show a notification: ${err.message}`;
    }
  });

  el.pushCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.pushConfig.value);
      el.pushCopy.textContent = 'Copied ✓';
      setTimeout(() => { el.pushCopy.textContent = 'Copy configuration'; }, 1500);
    } catch {
      el.pushConfig.select();
      el.pushStatus.textContent = 'Copy failed — select the text and copy it manually.';
    }
  });
}

const isFav = (q) => store.get('favs', []).some((f) => f.id === q.id);

function renderFavButton() {
  const on = current && isFav(current);
  el.fav.setAttribute('aria-pressed', String(!!on));
  el.fav.textContent = on ? '★ Saved' : '☆ Save';
}

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
  const favs = store.get('favs', []);
  el.favList.replaceChildren(
    ...favs.map((q) =>
      quoteItem(q, findSource(q.sourceId)?.name || q.source, () => {
        store.set('favs', store.get('favs', []).filter((f) => f.id !== q.id));
        renderLists();
        renderFavButton();
      })
    )
  );
  const history = store.get('history', []).filter((h) => h.date !== todayKey());
  el.historyList.replaceChildren(...history.map((h) => quoteItem(h.quote, `${h.date} · ${findSource(h.quote.sourceId)?.name || h.quote.source}`)));
}


function renderDataStatus() {
  let quotes = 0;
  let oldest = Infinity;
  let n = 0;
  for (const id of settings.enabled) {
    const c = loadCached(id);
    if (!c) continue;
    n++;
    quotes += c.quotes.length;
    oldest = Math.min(oldest, c.fetchedAt);
  }
  const when = n ? `last fetched ${new Date(oldest).toLocaleDateString()}` : 'nothing fetched yet';
  el.dataStatus.textContent = `${n} sources cached · ${quotes} quotes · ${when}`;
}

function setEnabled(id, on) {
  const has = settings.enabled.includes(id);
  if (on && !has) settings.enabled.push(id);
  if (!on && has) settings.enabled = settings.enabled.filter((x) => x !== id);
  saveSettings();
}

// ---------- events ----------

function bind() {
  el.openSources.addEventListener('click', () => openSettings());
  el.emptyAction.addEventListener('click', () => openSettings('topics'));
  for (const tab of el.tabs) tab.addEventListener('click', () => showTab(tab.dataset.tab));
  bindNotifications();

  el.dialog.addEventListener('close', async () => {
    settings.ownLines = el.ownLines.value;
    saveSettings();
    const { failed } = await ensureSources({ onLoaded: () => { if (!current) showToday(); } });
    // If today's pick came from a source that is now disabled, choose again.
    if (!current || !(settings.enabled.includes(current.sourceId) || (current.sourceId === OWN_ID && ownSource()))) {
      showToday({ replace: true });
    }
    if (failed.length) renderSources();
  });

  el.addCustom.addEventListener('click', async () => {
    const title = el.customTitle.value.trim();
    if (!title) return;
    const src = customSource(title);
    if (allSources().some((s) => s.id === src.id)) {
      el.customHint.textContent = 'Already in your list.';
      return;
    }
    el.customHint.textContent = `Looking up “${title}” on Wikiquote…`;
    el.addCustom.disabled = true;
    try {
      const data = await refreshSource(src);
      src.name = data.title;
      settings.customs.push(src);
      setEnabled(src.id, true);
      el.customTitle.value = '';
      el.customHint.textContent = `Added ${data.title} (${data.quotes.length} quotes).`;
      renderSources();
      renderTopics();
      ensureThumbs([src]).then((changed) => { if (changed && el.dialog.open) renderSources(); });
    } catch (err) {
      el.customHint.textContent = `Couldn't find a usable Wikiquote page for “${title}”. (${err.message})`;
    } finally {
      el.addCustom.disabled = false;
    }
  });
  el.customTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.addCustom.click();
    }
  });

  el.another.addEventListener('click', () => showToday({ replace: true }));

  el.copy.addEventListener('click', async () => {
    if (!current) return;
    const who = findSource(current.sourceId)?.name || current.source;
    try {
      const translated = settings.lang ? cachedTranslation(current, settings.lang) : '';
      await navigator.clipboard.writeText(`“${current.text}” — ${who}` + (translated ? `\n\n${translated}` : ''));
      setStatus('Copied.');
      setTimeout(() => setStatus(''), 1500);
    } catch {
      setStatus('Copy failed — select the text manually.');
    }
  });

  el.fav.addEventListener('click', () => {
    if (!current) return;
    const favs = store.get('favs', []);
    store.set('favs', isFav(current) ? favs.filter((f) => f.id !== current.id) : [current, ...favs]);
    renderFavButton();
    renderLists();
  });

  el.refreshAll.addEventListener('click', async () => {
    el.refreshAll.disabled = true;
    el.dataStatus.textContent = 'Refreshing…';
    await ensureSources({ force: true });
    renderSources();
    el.refreshAll.disabled = false;
  });

  el.resetSeen.addEventListener('click', () => {
    store.set('seen', []);
    el.dataStatus.textContent = 'Seen list cleared — quotes may repeat now.';
  });

  el.resetAll.addEventListener('click', () => {
    if (!confirm('Remove all cached quotes, settings, history and favourites?')) return;
    for (const k of store.keys('')) store.remove(k);
    location.reload();
  });

  // New day while the tab stays open (e.g. installed on a phone).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (store.get('today', {}).date !== todayKey()) {
      el.date.textContent = formatDate();
      showToday();
    }
    adoptPushedQuote();
  });
}

const formatDate = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

// ---------- boot ----------

async function init() {
  el.date.textContent = formatDate();
  bind();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  }
  showToday(); // instant if anything is cached
  renderLists();
  await adoptPushedQuote(); // a push received today wins over the local pick
  await ensureSources({ onLoaded: () => { if (!current) showToday(); } });
  if (!current) showToday();
}

init();
