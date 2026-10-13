// Personalisation from the user's 1–5 star ratings. Pure functions, no DOM.
//
// Two signals, both centred on a neutral rating of 3:
//   - source affinity: the (smoothed) average rating of quotes from a source
//     decides how often that source is chosen;
//   - content affinity: words from liked quotes add weight, words from
//     disliked ones subtract it; candidates are scored by their words.
// An exploration share keeps some picks uniform, so the pool never narrows
// to a handful of authors.

export const MIN_RATINGS = 3; // below this, picking stays uniform
const NEUTRAL = 3;
const SOURCE_PRIOR = 2; // pseudo-ratings at NEUTRAL: one 5★ alone doesn't dominate
const SOURCE_GAIN = 0.9;
const CONTENT_GAIN = 1.4;
const EXPLORE = 0.2;
const CANDIDATES = 40;

const STOP = new Set(
  ('about above after again against all also although among and another any are because been before being below between both but can cannot could did does doing down during each either else even ever every from further had has have having here hers herself himself his how however into its itself just least less like made make many more most much must myself neither never nor not now off once only other ought our ours ourselves out over own same shall she should since some such than that the their theirs them themselves then there these they this those thou thee thy thine through thus too under until upon very was were what when where whether which while who whom whose why will with within without would yet you your yours yourself yourselves hath doth shalt unto one two man men things thing')
    .split(' ')
);

/** Content words of a text, lightly stemmed ("habits" → "habit"). */
export function tokenize(text, display) {
  const out = new Set();
  for (let w of String(text).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []) {
    w = w.replace(/'s$/, '');
    if (w.length < 4 || STOP.has(w)) continue;
    const word = w;
    if (w.length > 5) w = w.replace(/(ings|ing|edly|ed|ies|es|s)$/, (m) => (m === 'ies' ? 'y' : ''));
    if (display && !display.has(w)) display.set(w, word);
    out.add(w);
  }
  return [...out];
}

/** Build the profile from `{ quoteId: { r, sourceId, text } }`. */
export function buildProfile(ratings) {
  const sources = {};
  const terms = new Map();
  const termCount = new Map();
  const likedCount = new Map(); // in how many liked (4–5★) quotes a term appears
  const display = new Map(); // stem → a real word, for the summary
  let n = 0;
  for (const { r, sourceId, text } of Object.values(ratings || {})) {
    if (!r) continue;
    n++;
    const d = r - NEUTRAL;
    const s = (sources[sourceId] ||= { sum: 0, n: 0 });
    s.sum += d;
    s.n++;
    for (const t of tokenize(text, display)) {
      terms.set(t, (terms.get(t) || 0) + d);
      termCount.set(t, (termCount.get(t) || 0) + 1);
      if (r >= 4) likedCount.set(t, (likedCount.get(t) || 0) + 1);
    }
  }
  // Average per term, damped by how often it was seen (one mention ≠ a theme).
  for (const [t, v] of terms) {
    const c = termCount.get(t);
    terms.set(t, (v / c) * (c / (c + 1)));
  }
  return { n, sources, terms, likedCount, display };
}

/** Smoothed affinity for a source, roughly in [-2, 2]. */
export function sourceAffinity(profile, sourceId) {
  const s = profile.sources[sourceId];
  return s ? s.sum / (s.n + SOURCE_PRIOR) : 0;
}

/** Content affinity of a text, roughly in [-2, 2]. */
export function contentAffinity(profile, text) {
  const toks = tokenize(text);
  if (!toks.length) return 0;
  let sum = 0;
  for (const t of toks) sum += profile.terms.get(t) || 0;
  return sum / Math.sqrt(toks.length);
}

function weighted(items, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Pick one quote from `buckets` (one array of quotes per source). Falls back
 * to uniform picking until there are MIN_RATINGS ratings, and on the
 * EXPLORE share of draws.
 */
export function pickPersonal(buckets, profile, rng, { bySource = true } = {}) {
  const uniform = () => {
    const b = buckets[Math.floor(rng() * buckets.length)];
    return b[Math.floor(rng() * b.length)];
  };
  if (!profile || profile.n < MIN_RATINGS || rng() < EXPLORE) return uniform();

  // Author mode: one bucket per source, so the source affinity picks the
  // bucket. Theme mode: buckets are themes spanning many authors, so the
  // author's affinity is applied per candidate instead.
  const bucket = bySource
    ? weighted(buckets, buckets.map((b) => Math.exp(SOURCE_GAIN * sourceAffinity(profile, b[0].sourceId))), rng)
    : buckets[Math.floor(rng() * buckets.length)];
  const candidates = [];
  for (let i = 0; i < Math.min(CANDIDATES, bucket.length); i++) candidates.push(bucket[Math.floor(rng() * bucket.length)]);
  const clamp = (x) => Math.max(-2, Math.min(2, x));
  const scores = candidates.map((q) =>
    Math.exp(CONTENT_GAIN * clamp(contentAffinity(profile, q.text)) + (bySource ? 0 : SOURCE_GAIN * clamp(sourceAffinity(profile, q.sourceId))))
  );
  return weighted(candidates, scores, rng);
}

/** Human-readable summary for the settings page. */
export function summarize(profile, nameOf) {
  const sources = Object.entries(profile.sources)
    .map(([id, s]) => ({ id, name: nameOf(id), score: s.sum / (s.n + SOURCE_PRIOR), n: s.n }))
    .sort((a, b) => b.score - a.score);
  const terms = [...profile.terms.entries()].sort((a, b) => b[1] - a[1]);
  return {
    liked: sources.filter((s) => s.score > 0.25).slice(0, 5),
    disliked: sources.filter((s) => s.score < -0.25).slice(-3).reverse(),
    // Only recurring words count as a theme: a term in one quote is noise.
    themes: terms
      .filter(([t, v]) => v > 0.4 && (profile.likedCount.get(t) || 0) >= 2)
      .slice(0, 8)
      .map(([t]) => profile.display.get(t) || t),
  };
}
