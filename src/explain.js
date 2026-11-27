// "What does it mean?" — a short explanation of a quote, written on the
// reader's own device by the browser's built-in language model (Chrome's
// Prompt API, Gemini Nano). Nothing is sent to a server and nothing costs
// money. Where the model is not available, the app offers links instead.
//
// The model is asked for English (its best-supported language); the app then
// translates the explanation like the quote itself.

const OPTS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

const SYSTEM = `You explain aphorisms and quotations to a thoughtful general reader.
In 3 or 4 short sentences: say plainly what the quote means, the idea or experience behind it, and one concrete way to apply it in everyday life.
Do not repeat the quote. Do not invent facts about the author. Plain prose only: no lists, no headings, no markdown.`;

/** The Prompt API entry point, current or older shape; null when absent. */
function api() {
  return globalThis.LanguageModel || globalThis.ai?.languageModel || null;
}

/**
 * 'available' | 'downloadable' | 'downloading' | 'unavailable'.
 * 'downloadable' means the first use downloads Chrome's model (once, large).
 */
export async function explainAvailability() {
  const LM = api();
  if (!LM) return 'unavailable';
  try {
    if (LM.availability) return await withTimeout(LM.availability(OPTS), 4000);
    // Older shape: capabilities().available = 'readily' | 'after-download' | 'no'
    const c = await withTimeout(LM.capabilities(), 4000);
    return { readily: 'available', 'after-download': 'downloadable' }[c.available] || 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Explain `quote` ({ text, author, context }). `onProgress(0..1)` reports the
 * model download on first use. Must be called from a user gesture when the
 * model still has to be downloaded.
 */
export async function explain({ text, author, context }, { onProgress, signal } = {}) {
  const LM = api();
  if (!LM) throw new Error('on-device model unavailable');
  const session = await LM.create({
    ...OPTS,
    signal,
    initialPrompts: [{ role: 'system', content: SYSTEM }],
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded > 1 ? e.loaded / (e.total || 1) : e.loaded));
    },
  });
  try {
    const where = context ? ` (${context})` : '';
    const out = await session.prompt(`Quote by ${author}${where}:\n"${text}"\n\nExplain it.`, { signal });
    return tidy(out);
  } finally {
    session.destroy?.();
  }
}

/** Strip any markdown the model adds anyway. */
function tidy(s) {
  return String(s || '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
}

/** Links offered when the on-device model is not available. */
export function explainLinks({ text, author }) {
  const words = text.split(/\s+/).slice(0, 14).join(' ');
  return [
    { label: 'Search its meaning', href: `https://www.google.com/search?q=${encodeURIComponent(`"${words}" ${author} meaning`)}` },
    { label: `About ${author}`, href: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(author)}` },
  ];
}
