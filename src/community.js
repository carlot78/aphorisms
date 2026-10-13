// Community ratings: every reader's 🙁/😐/🙂 goes to one shared table, and the
// aggregate per quote is blended into the daily pick (see taste.js).
//
// Privacy: only an anonymous random device id, the quote id (a hash) and the
// vote are sent. Passages from "My collection" are never sent.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './community-config.js';

export const communityEnabled = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const headers = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

/** Rating on the 1–5 scale → community vote: -1, 0 or +1 (null = withdrawn). */
export const toVote = (r) => (!r ? null : r <= 2 ? -1 : r === 3 ? 0 : 1);

/** Send one vote (or withdraw it). Throws on network/server errors. */
export async function sendVote(deviceId, { quoteId, sourceId, vote }) {
  const fn = vote === null ? 'clear_vote' : 'cast_vote';
  const body = vote === null
    ? { p_device: deviceId, p_quote: quoteId }
    : { p_device: deviceId, p_quote: quoteId, p_source: sourceId || null, p_vote: vote };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`community ${fn}: HTTP ${res.status}`);
}

/** All per-quote aggregates as `{ quoteId: [up, meh, down] }`. */
export async function fetchScores() {
  const out = {};
  const page = 1000;
  for (let from = 0; from < 50000; from += page) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/quote_scores?select=quote_id,up,meh,down`, {
      headers: { ...headers(), Range: `${from}-${from + page - 1}` },
    });
    if (!res.ok) throw new Error(`community scores: HTTP ${res.status}`);
    const rows = await res.json();
    for (const r of rows) out[r.quote_id] = [r.up, r.meh, r.down];
    if (rows.length < page) break;
  }
  return out;
}
