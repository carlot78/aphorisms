// Wikiquote client + parser.
//
// Runs unchanged in the browser (app.js) and in Node (scripts/fetch.mjs):
// no DOM, no dependencies — just fetch + a small tokenizer over the HTML
// that the MediaWiki `parse` API returns.
//
// Page layout we rely on (verified against en.wikiquote.org):
//   <div class="mw-heading mw-heading2"><h2>Quotes</h2>...</div>
//   <ul><li>Quote text
//     <ul><li>citation</li></ul>
//   </li></ul>

export const API = 'https://en.wikiquote.org/w/api.php';

// Section headings (at any level) whose quotes we do not want to surface.
const EXCLUDED_HEADING =
  /^(disputed|misattributed|attributed|unsourced|about|quotes about|quotes regarding|external links|see also|references|notes|sources|further reading|bibliography|works|filmography|related|criticism|dialogue|cast)\b/i;

const MIN_LEN = 30;
const MAX_LEN = 700;

export function apiUrl(title) {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'text',
    format: 'json',
    formatversion: '2',
    disabletoc: '1',
    redirects: '1',
    origin: '*',
  });
  return `${API}?${params}`;
}

/** Fetch one Wikiquote page and return its usable quotes. */
export async function fetchSource(title, { fetchImpl = globalThis.fetch, headers = {} } = {}) {
  const res = await fetchImpl(apiUrl(title), { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching "${title}"`);
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.code}: ${json.error.info}`);
  const pageTitle = json.parse.title;
  return {
    title: pageTitle,
    pageid: json.parse.pageid,
    url: `https://en.wikiquote.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
    quotes: extractQuotes(json.parse.text, pageTitle),
  };
}

/** Parse the HTML of a Wikiquote page into quote objects. */
export function extractQuotes(html, sourceTitle) {
  const quotes = [];
  const seen = new Set();
  const headingRe = /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const path = []; // path[level] = heading text, level 2..6

  let last = 0;
  let included = false; // content before the first heading is the intro
  let section = '';

  const flush = (segment) => {
    if (!included) return;
    for (const item of listItems(segment)) {
      const picked = pickText(item);
      if (!picked) continue;
      const { text, cite } = picked;
      const key = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      quotes.push({
        id: hash(`${sourceTitle}|${key}`),
        text,
        source: sourceTitle,
        section,
        cite,
      });
    }
  };

  for (const m of html.matchAll(headingRe)) {
    flush(html.slice(last, m.index));
    last = m.index + m[0].length;

    const level = Number(m[1]);
    path.length = level; // drop deeper headings
    path[level] = toText(m[2]);
    const active = path.slice(2).filter(Boolean);
    included = active.length > 0 && !active.some((h) => EXCLUDED_HEADING.test(h));
    section = active.slice(1).join(' › ');
  }
  flush(html.slice(last));
  return quotes;
}

/**
 * Yield top-level <li> elements of a HTML fragment, splitting each into the
 * quote body (`main`) and the texts of its nested list items (`subs`) —
 * translations, variants and citations.
 */
function* listItems(html) {
  const tagRe = /<(\/?)(ul|ol|li)\b[^>]*>/gi;
  let depth = 0; // list nesting depth
  let start = -1; // index where the current top-level <li> content begins

  for (const m of html.matchAll(tagRe)) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'li') {
      if (!closing && depth === 1 && start < 0) start = m.index + m[0].length;
      else if (closing && depth === 1 && start >= 0) {
        yield splitItem(html.slice(start, m.index));
        start = -1;
      }
    } else {
      depth += closing ? -1 : 1;
      if (depth < 0) depth = 0;
    }
  }
}

function splitItem(inner) {
  const i = inner.search(/<(ul|ol)\b/i);
  const main = toText(i >= 0 ? inner.slice(0, i) : inner);
  const subs = [];
  if (i >= 0) {
    // Direct children of the nested list only: strip each <li>'s own sublists.
    for (const m of inner.slice(i).matchAll(/<li\b[^>]*>([\s\S]*?)(?=<(?:ul|ol)\b|<\/li>)/gi)) {
      const t = toText(m[1]);
      if (t) subs.push(t);
    }
  }
  return { main, subs };
}

/**
 * Decide which text of a list item is the quote. Many pages for non-English
 * authors put the original at the top level and the English translation as
 * the first nested item; in that case we surface the translation.
 */
function pickText({ main, subs }) {
  const isCite = (s) => s.length <= 120 && (/\d/.test(s) || s.length <= 60);
  let text;
  let rest;
  if (looksEnglish(main)) {
    text = main;
    rest = subs;
  } else {
    const idx = subs.findIndex((s) => looksEnglish(s) && s.length >= MIN_LEN && !/^variant/i.test(s));
    if (idx < 0) return null;
    text = subs[idx];
    rest = subs.slice(idx + 1);
  }
  text = cleanQuote(text);
  if (!text) return null;
  const cite = rest.find((s) => isCite(s) && !/^variant/i.test(s)) || '';
  return { text, cite };
}

function cleanQuote(text) {
  text = text.replace(/^[“"']+|[”"']+$/g, '').trim();
  if (text.length < MIN_LEN || text.length > MAX_LEN) return '';
  if (!/[a-z]/i.test(text)) return '';
  if (/^(variant|as quoted|see also|source|translation|cf\.|note|ibid|p\.|pp\.|ch\.|chapter|book|part|section)\b/i.test(text)) return '';
  if (/\bISBN\b/.test(text)) return '';
  return text;
}

// Function words that are common in English and rare in Latin, Greek
// transliterations, French, German, Spanish and Italian.
const ENGLISH_WORDS = new Set(
  'the and of to is that it you not with for be are this have from by but what all we your can will one they which who do if there their would more when than our into only been them his was were has had should must never always nothing every things'.split(' ')
);

export function looksEnglish(text) {
  const words = text.toLowerCase().match(/[a-z']+/g);
  if (!words || words.length < 3) return false;
  let hits = 0;
  for (const w of words) if (ENGLISH_WORDS.has(w)) hits++;
  return hits >= 3 || hits / words.length >= 0.12;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function toText(html) {
  return html
    .replace(/<sup\b[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<span\b[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\[\s*(edit|\d+|citation needed)\s*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** FNV-1a 32-bit, hex. Stable across browser and Node. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
