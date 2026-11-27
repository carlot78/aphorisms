// Supabase Edge Function `explain`: a short explanation of one quote from
// the Aphorisms archive, in the reader's language, written by Claude Haiku
// and cached in public.explanations so each (quote, language) is generated
// once for everyone.
//
//   POST /functions/v1/explain   { "quoteId": "b8fccf77", "sourceId": "seneca", "lang": "it" }
//   -> 200 { "text": "...", "cached": true|false }
//
// Abuse limits: only quotes that exist in the published archive can be
// explained (the client sends ids, never text), and at most DAILY_CAP new
// explanations are generated per day across all readers.
//
// Secrets: ANTHROPIC_API_KEY (set in Supabase → Edge Functions → Secrets).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy with JWT verification off (the app sends its publishable key).

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-haiku-5-5";
const DAILY_CAP = 1500; // ≈ $0.15/day at most
const ARCHIVE = "https://carlot78.github.io/aphorisms/data/sources/";
const LANGS = new Set([
  "en", "it", "de", "fr", "es", "pt", "nl", "pl", "ro", "el", "tr", "cs", "sv", "da", "nb", "fi", "hu",
  "ru", "uk", "ar", "he", "hi", "zh-CN", "ja", "ko",
]);
const ALLOWED_ORIGINS = ["https://carlot78.github.io", "http://localhost:8765"];

const SYSTEM = `You explain aphorisms and quotations to a thoughtful general reader.
Write 3 or 4 short sentences: say plainly what the quote means, the idea or experience behind it, and one concrete way to apply it in everyday life.
Do not repeat or translate the quote itself. Do not invent facts about the author or the work; if the context is unclear, explain the idea on its own terms.
Plain prose only: no lists, no headings, no markdown, no preamble.
Write in the language you are asked for.`;

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Quote = { id: string; text: string; section?: string; cite?: string };
type Source = { title: string; quotes: Quote[] };
const archive = new Map<string, Promise<Source | null>>(); // per warm instance

function loadSource(id: string): Promise<Source | null> {
  if (!archive.has(id)) {
    archive.set(id, fetch(ARCHIVE + encodeURIComponent(id) + ".json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null));
  }
  return archive.get(id)!;
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
    "Vary": "Origin",
  };
}

const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || "English";
  } catch {
    return "English";
  }
};

Deno.serve(async (req) => {
  const headers = { ...cors(req), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  let quoteId = "", sourceId = "", lang = "en";
  try {
    const body = await req.json();
    quoteId = String(body.quoteId || "");
    sourceId = String(body.sourceId || "");
    lang = String(body.lang || "en");
  } catch {
    return reply(400, { error: "bad json" });
  }
  if (!/^[0-9a-f]{8}$/.test(quoteId) || !/^[a-z0-9-]{2,40}$/.test(sourceId) || !LANGS.has(lang)) {
    return reply(400, { error: "bad request" });
  }

  // 1. Already explained?
  const { data: hit, error: readErr } = await db.from("explanations").select("body")
    .eq("quote_id", quoteId).eq("lang", lang).maybeSingle();
  if (readErr) return reply(500, { error: "cache unavailable" });
  if (hit) return reply(200, { text: hit.body, cached: true });

  // 2. Only quotes from the published archive.
  const source = await loadSource(sourceId);
  const quote = source?.quotes.find((q) => q.id === quoteId);
  if (!source || !quote) return reply(404, { error: "unknown quote" });

  // 3. Daily budget across all readers.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("explanations").select("quote_id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= DAILY_CAP) return reply(429, { error: "daily limit reached" });

  // 4. Ask Claude.
  const context = [quote.section, quote.cite].filter(Boolean).join("; ");
  const prompt = `Quote by ${source.title}${context ? ` (${context})` : ""}:\n"${quote.text}"\n\nExplain it in ${languageName(lang)}.`;
  let text = "";
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return reply(422, { error: "declined" });
    for (const block of res.content) if (block.type === "text") text += block.text;
    text = text.replace(/\*\*|__/g, "").replace(/^#+\s*/gm, "").trim();
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return reply(429, { error: "busy, try later" });
    if (err instanceof Anthropic.AuthenticationError) return reply(503, { error: "not configured" });
    if (err instanceof Anthropic.APIError) return reply(502, { error: `model error ${err.status}` });
    return reply(502, { error: "model unavailable" });
  }
  if (!text) return reply(502, { error: "empty explanation" });

  // 5. Cache for everyone (a concurrent duplicate simply loses the race).
  await db.from("explanations").upsert({ quote_id: quoteId, lang, body: text.slice(0, 3000), model: MODEL }, { onConflict: "quote_id,lang", ignoreDuplicates: true });
  return reply(200, { text, cached: false });
});
