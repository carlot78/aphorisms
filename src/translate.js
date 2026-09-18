// Translation of a quote into the user's chosen language.
//
// Providers, tried in order:
//   1. The browser's built-in on-device Translator API (Chrome 138+): free,
//      private, works offline once the language pack is installed.
//   2. MyMemory — free public API, CORS-enabled, ~5000 chars/day anonymous,
//      500 bytes per request (long quotes are sent sentence by sentence).
//   3. Google Translate's public web endpoint as a last resort.
//
// The English text is always kept; the translation is shown alongside it.

export const LANGUAGES = [
  'it', 'de', 'fr', 'es', 'pt', 'nl', 'pl', 'ro', 'el', 'tr', 'cs', 'sv', 'da', 'nb', 'fi', 'hu',
  'ru', 'uk', 'ar', 'he', 'hi', 'zh-CN', 'ja', 'ko',
];

/** Human-readable language name in the viewer's own locale, e.g. "Italiano". */
export function languageName(code, locale = navigator.language) {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    if (name && name !== code) return name;
  } catch {
    /* Intl.DisplayNames unsupported */
  }
  return code;
}

const MYMEMORY_MAX = 450; // stay under the API's 500-byte limit for ASCII-ish text
const timeout = (ms) => (AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

/** Reject after `ms` — some browsers expose the Translator API but never resolve its promises. */
function withTimeout(promise, ms, what) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

async function viaBuiltin(text, lang) {
  const T = globalThis.Translator;
  if (!T?.availability) throw new Error('no built-in translator');
  const opts = { sourceLanguage: 'en', targetLanguage: lang.split('-')[0] };
  if ((await withTimeout(T.availability(opts), 3000, 'availability check')) !== 'available') throw new Error('language pack not installed');
  const translator = await withTimeout(T.create(opts), 5000, 'translator creation');
  try {
    return await withTimeout(translator.translate(text), 20000, 'on-device translation');
  } finally {
    translator.destroy?.();
  }
}

/** Split into sentence-ish chunks no longer than `max` characters. */
export function chunk(text, max) {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.!?;:]+[.!?;:]*\s*/g) || [text];
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (cur && (cur + p).length > max) {
      out.push(cur.trim());
      cur = '';
    }
    if (p.length > max) {
      // A single overlong sentence: cut at word boundaries.
      for (const w of p.split(/(?<=\s)/)) {
        if ((cur + w).length > max && cur) {
          out.push(cur.trim());
          cur = '';
        }
        cur += w;
      }
    } else {
      cur += p;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function viaMyMemory(text, lang) {
  const pieces = [];
  for (const part of chunk(text, MYMEMORY_MAX)) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(part)}&langpair=en|${encodeURIComponent(lang)}`;
    const res = await fetch(url, { signal: timeout(10000) });
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const json = await res.json();
    if (json.responseStatus !== 200 || json.quotaFinished) throw new Error(json.responseDetails || 'MyMemory quota finished');
    const t = json.responseData?.translatedText;
    if (!t || /^(query length limit exceeded|invalid|mymemory warning)/i.test(t)) throw new Error(t || 'empty translation');
    pieces.push(t);
  }
  return pieces.join(' ');
}

async function viaGoogle(text, lang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(lang)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: timeout(10000) });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const json = await res.json();
  const t = (json?.[0] || []).map((seg) => seg?.[0] || '').join('').trim();
  if (!t) throw new Error('empty translation');
  return t;
}

const PROVIDERS = [viaBuiltin, viaMyMemory, viaGoogle];

/** Translate English `text` into `lang`. Throws if every provider fails. */
export async function translate(text, lang) {
  const errors = [];
  for (const provider of PROVIDERS) {
    try {
      const out = await provider(text, lang);
      if (out && out.trim().toLowerCase() !== text.trim().toLowerCase()) return out.trim();
      errors.push(`${provider.name}: unchanged`);
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
    }
  }
  throw new Error(errors.join('; '));
}
