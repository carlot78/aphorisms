import { SOURCES, GROUPS, STARTER_IDS, sourceById, customSource } from './src/sources.js';
import { fetchSource, hash } from './src/wikiquote.js';
import { translate, LANGUAGES, languageName } from './src/translate.js';

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
  translation: $('quote-translation'), lang: $('lang'), langHint: $('lang-hint'),
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

function renderLanguageSelect() {
  const options = LANGUAGES.map((code) => [code, languageName(code)]).sort((a, b) => a[1].localeCompare(b[1]));
  el.lang.replaceChildren(
    new Option('No translation', ''),
    ...options.map(([code, name]) => new Option(name, code))
  );
  el.lang.value = settings.lang;
  el.langHint.textContent = settings.lang
    ? `Translated automatically (on-device when your browser supports it, otherwise via MyMemory / Google). The English original always stays.`
    : '';
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

function renderSources() {
  const groups = [...GROUPS, ...(settings.customs.length ? ['Custom'] : [])];
  el.groups.replaceChildren(
    ...groups.map((group) => {
      const items = allSources().filter((s) => s.group === group);
      const wrap = document.createElement('div');
      wrap.className = 'group';
      const h = document.createElement('h4');
      h.textContent = group;
      const tools = document.createElement('span');
      tools.className = 'group-tools';
      for (const [label, on] of [['all', true], ['none', false]]) {
        const a = document.createElement('a');
        a.textContent = label;
        a.addEventListener('click', () => {
          for (const s of items) setEnabled(s.id, on);
          renderSources();
        });
        tools.append(a);
      }
      h.append(tools);
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const s of items) {
        const label = document.createElement('label');
        label.className = 'chip';
        label.title = s.blurb || '';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = settings.enabled.includes(s.id);
        input.addEventListener('change', () => {
          setEnabled(s.id, input.checked);
          renderEnabledCount();
        });
        label.append(input, document.createTextNode(s.name));
        const cached = loadCached(s.id);
        if (cached) {
          const n = document.createElement('span');
          n.className = 'n';
          n.textContent = cached.quotes.length;
          label.append(n);
        }
        if (s.custom) {
          const rm = document.createElement('span');
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
          });
          label.append(rm);
        }
        chips.append(label);
      }
      wrap.append(h, chips);
      return wrap;
    })
  );
  renderEnabledCount();
}

function renderEnabledCount() {
  el.enabledCount.textContent = `${settings.enabled.length} selected`;
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
  el.openSources.addEventListener('click', () => {
    renderSources();
    renderDataStatus();
    el.ownLines.value = settings.ownLines;
    renderLanguageSelect();
    el.dialog.showModal();
  });
  el.emptyAction.addEventListener('click', () => el.openSources.click());

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

  el.lang.addEventListener('change', () => {
    settings.lang = el.lang.value;
    saveSettings();
    renderLanguageSelect();
    if (current) renderTranslation(current);
  });

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
    if (document.visibilityState === 'visible' && store.get('today', {}).date !== todayKey()) {
      el.date.textContent = formatDate();
      showToday();
    }
  });
}

const formatDate = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

// ---------- boot ----------

async function init() {
  el.date.textContent = formatDate();
  bind();
  showToday(); // instant if anything is cached
  renderLists();
  await ensureSources({ onLoaded: () => { if (!current) showToday(); } });
  if (!current) showToday();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  }
}

init();
