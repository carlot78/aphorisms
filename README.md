# Aphorisms

One thought a day — a sentence, aphorism or short paragraph — drawn from the
personal-development sources you choose. The app fetches the text itself from
[Wikiquote](https://en.wikiquote.org), so the pool keeps growing without you
maintaining a quote list.

**Live app:** https://carlot78.github.io/aphorisms/

## How it works

- **Choose what inspires you** — on first launch you pick a few themes
  (resilience, calm mind, death & time, habits, happiness…). Each day you get
  one thought on them, from every author in the catalogue. You can also follow
  specific authors, and add passages of your own.
- **A daily ritual** — today's thought waits under a wax seal. Breaking it
  keeps your **streak** going; ratings, saves and new authors earn XP towards
  seven levels (Novice → Oracle) and twelve laurels. Tap the 🔥 to see your
  journey.
- **It learns your taste** — rate each thought 🙁 😐 🙂. Your ratings, and —
  when the community database is configured — everyone's, tilt future picks
  towards what speaks to you. One pick in five stays random, and about once a
  week a completely new author is introduced.
- **Autonomous retrieval** — quotes come from Wikiquote, live in the browser
  and from a weekly snapshot committed by a GitHub Action
  ([`refresh-quotes.yml`](.github/workflows/refresh-quotes.yml)), which also
  rebuilds the theme index.
- **Translation** — optionally show each thought in a second language too.
- **Send text from other apps** — share a passage from Chrome, Kindle, a PDF
  reader… (Android share sheet once installed, bookmarklet on desktop), or
  import Kindle `My Clippings.txt`.
- **Daily reminder** — optional push notification at your hour, for every reader (subscriptions in Supabase, sent by a GitHub Action).
- **Installable & offline** — a PWA: "Add to Home Screen" on a phone.
- **Private** — everything lives in your browser. Community votes, if enabled,
  carry only an anonymous random id, a quote hash and the vote; your own
  passages are never sent.

## Community ratings (optional, Supabase)

Shared ratings need a small database. Supabase's free tier is enough:

1. Create a project at [supabase.com](https://supabase.com) (free plan).
2. Open **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql)
   and run it. It creates the `votes` table (not publicly readable), two
   functions to cast/clear a vote, and the aggregate view `quote_scores`.
3. In **Project Settings → API**, copy the **Project URL** and the **anon
   public** key into [`src/community-config.js`](src/community-config.js),
   commit and push. Both values are public by design.

Until then the app works on each reader's own ratings only.

## Android app (Google Play)

The app is packaged as a Trusted Web Activity with PWABuilder; the domain
verification file lives in the [`carlot78.github.io`](https://github.com/carlot78/carlot78.github.io)
repository. Step-by-step guide (in Italian), store texts and Data safety
answers: [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md).

## Run locally

It's plain HTML/JS with no build step. Serve the folder over HTTP (ES modules
don't load from `file://`):

```bash
python -m http.server 8080
```

then open http://localhost:8080.

## Daily reminder (push notifications)

Readers turn it on in the app (Settings → Daily reminder → *Turn on*). The
device stores its push subscription, hour, time zone, themes and language in
Supabase by itself ([`supabase/push.sql`](supabase/push.sql)), and keeps it
current when settings change. The
[`daily-push.yml`](.github/workflows/daily-push.yml) workflow runs twice an
hour and sends each subscriber their thought on the first run at or after their
hour, once per local day; expired subscriptions are removed.

One-time setup:

1. In Supabase: **SQL Editor → New query**, paste `supabase/push.sql`, run.
2. Repository secrets (**Settings → Secrets and variables → Actions**):
   - `VAPID_PRIVATE_KEY` — private half of the key in `src/push-config.js`;
   - `SUPABASE_SECRET_KEY` — Supabase **Project Settings → API Keys → Secret
     key** (`sb_secret_…`). Never put this one in the code.
3. Test: **Actions → Daily push → Run workflow** with *force* ticked.

GitHub's schedule is best-effort, so a reminder can arrive some minutes (rarely
an hour or more) after the chosen time.

## Refresh the snapshot manually

```bash
node scripts/fetch.mjs            # every catalog source
node scripts/fetch.mjs seneca     # one source id (see src/sources.js)
```

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The app |
| `src/wikiquote.js` | Wikiquote fetch + HTML parser (shared by browser and Node) |
| `src/sources.js` | Source catalog |
| `src/translate.js` | Translation providers (on-device → MyMemory → Google) |
| `scripts/fetch.mjs` | Snapshot builder used by the Action |
| `scripts/push.mjs`, `src/push.js`, `src/push-config.js` | Web Push: sender (Action), browser subscription, VAPID public key |
| `src/journey.js` | Streaks, XP, levels, laurels |
| `src/community.js`, `src/community-config.js`, `supabase/schema.sql` | Shared ratings (Supabase) |
| `src/themes.js`, `scripts/themes.mjs` | Themes and the weekly theme index |
| `data/` | Generated snapshot (committed by the Action) |
| `sw.js`, `manifest.webmanifest` | PWA bits |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Requirements and architecture document |

## Licence

Code: MIT. Quote text comes from Wikiquote and is
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
